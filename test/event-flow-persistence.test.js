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
    status: { water: 90, nutrition: 60, health: 80, stress: 30, risk: 30, growth: 0 },
    boost: { active: {}, cooldowns: {} },
    actions: { catalog: [] },
    plant: {
      phase: 'vegetative',
      isDead: false,
      stageIndex: 1,
      stageKey: 'veg',
      stageProgress: 0.3,
      stageStartSimDay: 1,
      lastValidStageKey: 'veg',
      averageHealth: 78,
      averageStress: 28,
      observedSimMs: 0,
      lifecycle: { totalSimDays: 90, qualityTier: 'normal', qualityScore: 0, qualityLocked: false },
    assets: { basePath: 'assets/plant_growth/', resolvedStagePath: 'assets/plant_growth/plant_growth_sprite.png#frame_016' }
    },
    simulation: {
      nowMs: 10_000,
      startRealTimeMs: 5_000,
      lastTickRealTimeMs: 9_000,
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
      machineState: 'activeEvent',
      activeEventId: 'drooping_leaves_warning',
      activeCategory: 'water',
      activeLearningNote: 'Drainage early.',
      activeOptions: [
        { id: 'ignore_signals', label: 'Ignore signs', effects: { stress: 5, risk: 6 }, followUps: ['set_flag:root_stress_pending'] }
      ],
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
          id: 'drooping_leaves_warning',
          title: 'Drooping leaves warning',
          description: 'Water pressure event',
          category: 'water',
          tone: 'warning',
          allowedPhases: ['vegetative'],
          options: [{ id: 'ignore_signals', label: 'Ignore signs', effects: { stress: 5, risk: 6 }, followUps: ['set_flag:root_stress_pending'] }]
        },
        {
          id: 'root_stress_followup',
          title: 'Root stress follow-up',
          description: 'Root stress escalated',
          category: 'disease',
          tone: 'negative',
          isFollowUp: true,
          allowedPhases: ['vegetative'],
          options: [{ id: 'recover_root_zone', label: 'Recover root zone', effects: { stress: -6, risk: -5 }, followUps: ['clear_flag:root_stress_pending'] }]
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

(async function testEventFlowPersistenceIntegration() {
  const runtime = createRuntimeContext(buildBaseState());
  const eventsApi = runtime.window.GrowSimEvents;
  const storageApi = runtime.window.GrowSimStorage;

  eventsApi.onEventOptionClick('ignore_signals');

  const pendingBeforeSave = memoryApi.getPendingChain(runtime.state.events, 'root_stress_followup');
  assert(pendingBeforeSave, 'decision should create pending chain before save');

  const decisionBeforeSave = memoryApi.getLastDecision(runtime.state.events);
  assert(decisionBeforeSave, 'decision should be persisted before save');
  assert.strictEqual(decisionBeforeSave.eventId, 'drooping_leaves_warning');
  assert.strictEqual(decisionBeforeSave.optionId, 'ignore_signals');

  const analysisBeforeSave = analysisApi.getLatestAnalysis(runtime.state.events);
  assert(analysisBeforeSave, 'analysis should exist before save');
  assert.strictEqual(analysisBeforeSave.relatedChainId, 'root_stress_followup');

  storageApi.syncCanonicalStateShape();
  await storageApi.persistState();

  const persistedRaw = runtime.localStorage.getItem(runtime.LS_STATE_KEY);
  assert(persistedRaw, 'persisted snapshot should be written to localStorage');

  const persistedSnapshot = JSON.parse(persistedRaw);
  const canonicalPersistedEvents = storageApi.getCanonicalEvents({ events: persistedSnapshot.events });
  assert(canonicalPersistedEvents.foundation.memory.pendingChains.root_stress_followup, 'canonicalized snapshot should preserve pending chain');
  assert.strictEqual(
    canonicalPersistedEvents.foundation.memory.pendingChains.root_stress_followup.sourceEventId,
    'drooping_leaves_warning',
    'canonicalized pending chain should preserve causal source'
  );

  const reloaded = createRuntimeContext(buildBaseState(), persistedRaw);
  const reloadedStorageApi = reloaded.window.GrowSimStorage;
  await reloadedStorageApi.restoreState();
  reloadedStorageApi.syncCanonicalStateShape();

  const restoredPending = memoryApi.getPendingChain(reloaded.state.events, 'root_stress_followup');
  assert(restoredPending, 'restored state should keep pending chain');
  assert.strictEqual(restoredPending.sourceOptionId, 'ignore_signals');

  const restoredDecision = memoryApi.getLastDecision(reloaded.state.events);
  assert(restoredDecision, 'restored state should keep decision memory');
  assert(restoredDecision.analysisId, 'restored decision should still reference analysis');

  const restoredAnalysis = analysisApi.getLatestAnalysis(reloaded.state.events);
  assert(restoredAnalysis, 'restored state should keep analysis history');
  assert.strictEqual(restoredAnalysis.eventId, 'drooping_leaves_warning');
  assert.strictEqual(restoredAnalysis.relatedChainId, 'root_stress_followup');

  reloaded.state.events.machineState = 'idle';
  reloaded.state.simulation.nowMs += 1;
  reloaded.state.events.scheduler.nextEventRealTimeMs = 0;

  const reloadedEventsApi = reloaded.window.GrowSimEvents;
  const activated = reloadedEventsApi.activateEvent(reloaded.state.simulation.nowMs);
  assert.strictEqual(activated, true, 'follow-up should still activate after reload');
  assert.strictEqual(reloaded.state.events.activeEventId, 'root_stress_followup');

  assert.strictEqual(
    memoryApi.getPendingChain(reloaded.state.events, 'root_stress_followup'),
    null,
    'pending chain should be consumed after follow-up activation post-reload'
  );

  const postReloadEvent = memoryApi.getLastEvents(reloaded.state.events, 1)[0];
  assert(postReloadEvent, 'post-reload activation should append memory event');
  assert.strictEqual(postReloadEvent.eventId, 'root_stress_followup');
  assert.strictEqual(postReloadEvent.meta.consumedChainId, 'root_stress_followup');
  assert.strictEqual(postReloadEvent.meta.sourceEventId, 'drooping_leaves_warning');

  const pendingChainsAfterConsume = memoryApi.getPendingChains(reloaded.state.events);
  assert.deepStrictEqual(
    Object.keys(pendingChainsAfterConsume),
    [],
    'no stale or duplicate pending chain should remain after post-reload consume'
  );

  const resolverCandidateAfterConsume = reloadedEventsApi.resolveFoundationCandidateEvent();
  assert.notStrictEqual(
    resolverCandidateAfterConsume && resolverCandidateAfterConsume.reason,
    'pending_chain:root_stress_followup',
    'resolver should not see stale pending-chain pressure after post-reload consume'
  );

  console.log('event-flow persistence integration test passed');
})();
