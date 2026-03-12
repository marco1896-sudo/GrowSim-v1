#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const plantStateApi = require('../src/simulation/plantState.js');
const flagsApi = require('../src/events/eventFlags.js');
const memoryApi = require('../src/events/eventMemory.js');
const analysisApi = require('../src/events/eventAnalysis.js');
const resolverApi = require('../src/events/eventResolver.js');

function buildBaseState() {
  return {
    schemaVersion: '1.0.0',
    seed: 'seed',
    plantId: 'plant',
    status: { water: 70, nutrition: 58, health: 82, stress: 28, risk: 25, growth: 0 },
    boost: { active: {}, cooldowns: {} },
    actions: { catalog: [] },
    plant: {
      phase: 'vegetative',
      isDead: false,
      stageIndex: 1,
      stageKey: 'veg',
      stageProgress: 0.25,
      stageStartSimDay: 1,
      lastValidStageKey: 'veg',
      averageHealth: 80,
      averageStress: 24,
      observedSimMs: 0,
      lifecycle: { totalSimDays: 90, qualityTier: 'normal', qualityScore: 0, qualityLocked: false },
    assets: { basePath: 'assets/plant_growth/', resolvedStagePath: 'assets/plant_growth/plant_growth_sprite.png#frame_016' }
    },
    simulation: {
      nowMs: 20_000,
      startRealTimeMs: 5_000,
      lastTickRealTimeMs: 19_000,
      simTimeMs: 5_000,
      simEpochMs: 1_000,
      simDay: 1,
      simHour: 12,
      simMinute: 0,
      tickCount: 42,
      mode: 'test',
      tickIntervalMs: 1000,
      timeCompression: 60,
      globalSeed: 'seed',
      plantId: 'plant',
      dayWindow: { startHour: 7, endHour: 22 },
      isDaytime: true,
      growthImpulse: 0,
      lastPushScheduleAtMs: 0
    },
    setup: { mode: 'soil' },
    settings: { notifications: { enabled: false, types: { events: true, critical: true, reminder: true }, runtime: { lastNotifiedEventId: null, lastCriticalAtRealMs: 0, lastReminderAtRealMs: 0 }, lastMessage: null } },
    meta: { rescue: { used: false, usedAtRealMs: null, lastResult: null } },
    history: { actions: [], events: [], system: [], systemLog: [] },
    ui: { openSheet: null, menuOpen: false, menuDialogOpen: false, visibleOverlayIds: [], care: { selectedCategory: null, feedback: { kind: 'info', text: 'Bereit.' } }, analysis: { activeTab: 'overview' }, deathOverlayOpen: false, deathOverlayAcknowledged: false },
    events: {
      machineState: 'idle',
      activeEventId: null,
      activeCategory: 'generic',
      activeLearningNote: '',
      activeOptions: [],
      scheduler: {
        nextEventRealTimeMs: 0,
        eventCooldowns: {},
        categoryCooldowns: {},
        lastEventId: null,
        lastChoiceId: null,
        lastEventCategory: null,
        lastEventRealTimeMs: 0,
        deferredUntilDaytime: false,
        windowRealMinutes: { min: 30, max: 90 }
      },
      catalog: [
        {
          id: 'root_stress_followup',
          title: 'Root stress follow-up',
          description: 'Root stress escalated',
          category: 'disease',
          tone: 'negative',
          isFollowUp: true,
          allowedPhases: ['vegetative'],
          options: [{ id: 'recover_root_zone', label: 'Recover root zone', effects: { stress: -6, risk: -5 }, followUps: ['clear_flag:root_stress_pending'] }]
        },
        {
          id: 'humidity_lock_followup',
          title: 'Humidity lock follow-up',
          description: 'High humidity stress',
          category: 'environment',
          tone: 'warning',
          isFollowUp: true,
          allowedPhases: ['vegetative'],
          options: [{ id: 'open_air_exchange', label: 'Open air exchange', effects: { stress: -4, risk: -3 } }]
        }
      ],
      foundation: {
        flags: {},
        memory: { events: [], decisions: [], pendingChains: {} },
        analysis: []
      },
      history: []
    }
  };
}

function createRuntimeContext(initialState, persistedRaw = null) {
  const storageStore = new Map();
  if (persistedRaw != null) {
    storageStore.set('gs_test', persistedRaw);
  }

  const context = {
    console,
    Date,
    Math,
    JSON,
    Number,
    Object,
    Array,
    String,
    Boolean,
    setTimeout,
    clearTimeout,
    Promise,
    LS_STATE_KEY: 'gs_test',
    MODE: 'test',
    UI_TICK_INTERVAL_MS: 1000,
    SIM_TIME_COMPRESSION: 60,
    SIM_GLOBAL_SEED: 'seed',
    SIM_PLANT_ID: 'plant',
    SIM_START_HOUR: 7,
    SIM_DAY_START_HOUR: 7,
    SIM_NIGHT_START_HOUR: 22,
    EVENT_ROLL_MIN_REAL_MS: 60 * 1000,
    EVENT_ROLL_MAX_REAL_MS: 2 * 60 * 1000,
    EVENT_COOLDOWN_MS: 30 * 60 * 1000,
    TOTAL_LIFECYCLE_SIM_DAYS: 90,
    PERSIST_THROTTLE_MS: 100,
    MAX_HISTORY_LOG: 50,
    MAX_EVENT_HISTORY: 20,
    MAX_SYSTEM_HISTORY: 20,
    MAX_ACTION_HISTORY: 20,
    clampInt: (v, min, max) => Math.max(min, Math.min(max, Number(v) || 0)),
    clamp: (v, min, max) => Math.max(min, Math.min(max, Number(v) || 0)),
    round2: (v) => Math.round((Number(v) || 0) * 100) / 100,
    deterministicUnitFloat: () => 0,
    deterministicRoll: () => 0,
    deterministicEventDelayMs: () => 60 * 1000,
    simDayFloat: () => 1,
    simHour: () => 12,
    eventThreshold: () => 1,
    alignToSimStartHour: (x) => x,
    isDaytimeAtSimTime: () => true,
    dayStamp: () => 'd1',
    computeGrowthPercent: () => 0,
    getStageTimeline: () => [{ phase: 'vegetative', simDayStart: 0 }],
    normalizeStageKey: (v) => String(v || 'stage_01'),
    stageAssetKeyForIndex: () => 'stage_01',
  plantAssetPath: () => 'assets/plant_growth/plant_growth_sprite.png#frame_016',
    nextDaytimeRealMs: (nowMs) => nowMs,
    schedulePushIfAllowed: () => {},
    schedulePersistState: () => {},
    renderAll: () => {},
    notifyPlantNeedsCare: () => {},
    addLog: () => {},
    isPlantDead: () => false,
    clampStatus: () => {},
    storageAdapter: null,
    persistTimer: null,
    state: initialState,
    localStorage: {
      getItem: (key) => (storageStore.has(key) ? storageStore.get(key) : null),
      setItem: (key, value) => storageStore.set(key, value)
    },
    window: {
      GrowSimPlantState: plantStateApi,
      GrowSimEventFlags: flagsApi,
      GrowSimEventMemory: memoryApi,
      GrowSimEventAnalysis: analysisApi,
      GrowSimEventResolver: resolverApi
    }
  };

  vm.createContext(context);
  const storageSource = fs.readFileSync(path.join(__dirname, '..', 'storage.js'), 'utf8');
  vm.runInContext(storageSource, context, { filename: 'storage.js' });
  context.storageAdapter = context.window.GrowSimStorage.localStorageAdapter();

  const eventsSource = fs.readFileSync(path.join(__dirname, '..', 'events.js'), 'utf8');
  vm.runInContext(eventsSource, context, { filename: 'events.js' });

  return context;
}

(async function testEventFlowMultiChainPersistenceIntegration() {
  const olderTime = 40_000;
  const newerTime = 50_000;

  const runtime = createRuntimeContext(buildBaseState());
  const storageApi = runtime.window.GrowSimStorage;

  memoryApi.setPendingChain(runtime.state.events, 'root_stress_followup', {
    targetEventId: 'root_stress_followup',
    sourceEventId: 'drooping_leaves_warning',
    sourceOptionId: 'ignore_signals',
    createdAtRealTimeMs: olderTime
  });
  memoryApi.setPendingChain(runtime.state.events, 'humidity_lock_followup', {
    targetEventId: 'humidity_lock_followup',
    sourceEventId: 'humidity_spike_warning',
    sourceOptionId: 'delay_venting',
    createdAtRealTimeMs: newerTime
  });

  const pendingBeforeSave = memoryApi.getPendingChains(runtime.state.events);
  assert.strictEqual(Object.keys(pendingBeforeSave).length, 2, 'both pending chains should coexist before save');

  storageApi.syncCanonicalStateShape();
  await storageApi.persistState();

  const persistedRaw = runtime.localStorage.getItem(runtime.LS_STATE_KEY);
  assert(persistedRaw, 'persisted snapshot should be written');

  const persistedSnapshot = JSON.parse(persistedRaw);
  const canonicalPersistedEvents = storageApi.getCanonicalEvents({ events: persistedSnapshot.events });
  const canonicalChains = canonicalPersistedEvents.foundation.memory.pendingChains;
  assert(canonicalChains.root_stress_followup, 'older chain should survive canonicalization');
  assert(canonicalChains.humidity_lock_followup, 'newer chain should survive canonicalization');
  assert(
    canonicalChains.humidity_lock_followup.createdAtRealTimeMs > canonicalChains.root_stress_followup.createdAtRealTimeMs,
    'canonicalization should preserve chain ordering signals via created timestamps'
  );

  const reloaded = createRuntimeContext(buildBaseState(), persistedRaw);
  const reloadedStorageApi = reloaded.window.GrowSimStorage;
  const reloadedEventsApi = reloaded.window.GrowSimEvents;

  await reloadedStorageApi.restoreState();
  reloadedStorageApi.syncCanonicalStateShape();

  const restoredChains = memoryApi.getPendingChains(reloaded.state.events);
  assert.strictEqual(Object.keys(restoredChains).length, 2, 'restore should rebuild both pending chains');
  assert(
    restoredChains.humidity_lock_followup.createdAtRealTimeMs > restoredChains.root_stress_followup.createdAtRealTimeMs,
    'restore should preserve deterministic precedence signal'
  );

  const firstCandidate = reloadedEventsApi.resolveFoundationCandidateEvent();
  assert.strictEqual(firstCandidate.eventId, 'humidity_lock_followup', 'resolver should pick most recent pending chain first after reload');
  assert.strictEqual(firstCandidate.reason, 'pending_chain:humidity_lock_followup');

  reloaded.state.events.machineState = 'idle';
  reloaded.state.events.scheduler.nextEventRealTimeMs = 0;
  reloaded.state.simulation.nowMs += 1;

  const firstActivated = reloadedEventsApi.activateEvent(reloaded.state.simulation.nowMs);
  assert.strictEqual(firstActivated, true, 'first follow-up should activate');
  assert.strictEqual(reloaded.state.events.activeEventId, 'humidity_lock_followup');
  assert.strictEqual(memoryApi.getPendingChain(reloaded.state.events, 'humidity_lock_followup'), null, 'first chain should be consumed');

  const chainAfterFirstConsume = memoryApi.getPendingChain(reloaded.state.events, 'root_stress_followup');
  assert(chainAfterFirstConsume, 'second chain should remain pending after first activation');
  assert.strictEqual(chainAfterFirstConsume.sourceEventId, 'drooping_leaves_warning');

  const firstActivationMemory = memoryApi.getLastEvents(reloaded.state.events, 1)[0];
  assert.strictEqual(firstActivationMemory.eventId, 'humidity_lock_followup');
  assert.strictEqual(firstActivationMemory.meta.consumedChainId, 'humidity_lock_followup');

  reloaded.state.events.machineState = 'idle';
  reloaded.state.events.scheduler.nextEventRealTimeMs = 0;
  reloaded.state.simulation.nowMs += 1;

  const secondCandidate = reloadedEventsApi.resolveFoundationCandidateEvent();
  assert.strictEqual(secondCandidate.eventId, 'root_stress_followup', 'remaining pending chain should become next candidate');
  assert.strictEqual(secondCandidate.reason, 'pending_chain:root_stress_followup');

  const secondActivated = reloadedEventsApi.activateEvent(reloaded.state.simulation.nowMs);
  assert.strictEqual(secondActivated, true, 'second follow-up should activate after first consumption');
  assert.strictEqual(reloaded.state.events.activeEventId, 'root_stress_followup');
  assert.strictEqual(memoryApi.getPendingChain(reloaded.state.events, 'root_stress_followup'), null, 'second chain should be consumed');

  const allPendingAfterConsume = memoryApi.getPendingChains(reloaded.state.events);
  assert.deepStrictEqual(Object.keys(allPendingAfterConsume), [], 'no stale or duplicate pending chains should remain');

  const secondActivationMemory = memoryApi.getLastEvents(reloaded.state.events, 1)[0];
  assert.strictEqual(secondActivationMemory.eventId, 'root_stress_followup');
  assert.strictEqual(secondActivationMemory.meta.consumedChainId, 'root_stress_followup');
  assert.strictEqual(secondActivationMemory.meta.sourceEventId, 'drooping_leaves_warning');

  const resolverCandidateAfterAllConsumed = reloadedEventsApi.resolveFoundationCandidateEvent();
  assert.notStrictEqual(
    resolverCandidateAfterAllConsumed && resolverCandidateAfterAllConsumed.reason,
    'pending_chain:humidity_lock_followup',
    'resolver should not keep stale pressure for first chain'
  );
  assert.notStrictEqual(
    resolverCandidateAfterAllConsumed && resolverCandidateAfterAllConsumed.reason,
    'pending_chain:root_stress_followup',
    'resolver should not keep stale pressure for second chain'
  );

  console.log('event-flow multi-chain persistence integration test passed');
})();
