'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const memoryApi = require('../src/events/eventMemory.js');
const { resolveNextEvent } = require('../src/events/eventResolver.js');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadStorageApi() {
  const storagePath = path.join(__dirname, '..', 'storage.js');
  const code = fs.readFileSync(storagePath, 'utf8');
  const context = {
    window: {},
    state: {},
    LS_STATE_KEY: 'gs_test',
    MODE: 'test',
    UI_TICK_INTERVAL_MS: 1000,
    SIM_TIME_COMPRESSION: 60,
    SIM_GLOBAL_SEED: 'seed',
    SIM_PLANT_ID: 'plant',
    SIM_START_HOUR: 7,
    SIM_DAY_START_HOUR: 7,
    SIM_NIGHT_START_HOUR: 22,
    EVENT_ROLL_MIN_REAL_MS: 30000,
    TOTAL_LIFECYCLE_SIM_DAYS: 90,
    alignToSimStartHour: (x) => x,
    isDaytimeAtSimTime: () => true,
    deterministicEventDelayMs: () => 60000,
    clampInt: (v, min, max) => Math.max(min, Math.min(max, Number(v) || 0)),
    clamp: (v, min, max) => Math.max(min, Math.min(max, Number(v) || 0)),
    round2: (v) => Math.round((Number(v) || 0) * 100) / 100,
    computeGrowthPercent: () => 0,
    dayStamp: () => 'd',
    getStageTimeline: () => [{ phase: 'seedling', simDayStart: 0 }],
    normalizeStageKey: (v) => String(v || 'stage_01'),
    stageAssetKeyForIndex: () => 'stage_01',
    localStorage: { getItem: () => null, setItem: () => {} },
    Date,
    JSON,
    Number,
    Object,
    Array,
    Math,
    setTimeout,
    clearTimeout,
    console
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'storage.js' });
  return context.window.GrowSimStorage;
}

(function run() {
  const eventsState = { foundation: { memory: { events: [], decisions: [], pendingChains: {} } } };

  memoryApi.setPendingChain(eventsState, 'root_stress_followup', {
    targetEventId: 'root_stress_followup',
    sourceEventId: 'drooping_leaves_warning',
    sourceOptionId: 'ignore_signals',
    createdAtRealTimeMs: Date.now()
  });
  const created = memoryApi.getPendingChain(eventsState, 'root_stress_followup');
  assert(created && created.targetEventId === 'root_stress_followup', 'Expected pending chain creation');

  const resolverMemory = {
    getPendingChains: () => memoryApi.getPendingChains(eventsState),
    getLastEvents: (count) => memoryApi.getLastEvents(eventsState, count),
    getRecentAnalysis: () => [],
    getLastDecision: () => memoryApi.getLastDecision(eventsState)
  };

  const catalog = [
    { id: 'root_stress_followup', allowedPhases: ['vegetative'], category: 'disease', tone: 'negative', isFollowUp: true },
    { id: 'stable_growth_reward', allowedPhases: ['vegetative'], category: 'positive', tone: 'positive', isFollowUp: false }
  ];

  const candidate = resolveNextEvent({
    state: { phase: 'vegetative', water: 70, nutrients: 60, vitality: 70, stress: 40, pestPressure: 10 },
    flags: [],
    memory: resolverMemory,
    catalog
  });
  assert(candidate.eventId === 'root_stress_followup', 'Expected resolver to prioritize pending chain event');

  const consumed = memoryApi.consumePendingChain(eventsState, candidate.eventId);
  assert(consumed && consumed.chainId === 'root_stress_followup', 'Expected pending chain consumed by selected follow-up');
  assert(memoryApi.getPendingChain(eventsState, 'root_stress_followup') === null, 'Expected chain removed after consume');

  memoryApi.setPendingChain(eventsState, 'root_stress_followup', {
    targetEventId: 'root_stress_followup',
    sourceEventId: 'drooping_leaves_warning',
    sourceOptionId: 'ignore_signals',
    createdAtRealTimeMs: Date.now() - 1000,
    expiresAtRealTimeMs: Date.now() - 10
  });
  assert(memoryApi.getPendingChain(eventsState, 'root_stress_followup') === null, 'Expected expired chain to self-prune');

  const storageApi = loadStorageApi();
  const snapshot = {
    events: {
      scheduler: {},
      foundation: {
        memory: {
          events: [],
          decisions: [],
          pendingChains: {
            root_stress_followup: {
              eventId: 'drooping_leaves_warning',
              optionId: 'ignore_signals',
              atRealTimeMs: Date.now(),
              meta: { legacy: true }
            },
            bad_entry: 'nope'
          }
        }
      }
    }
  };

  const canonical = storageApi.getCanonicalEvents(snapshot);
  const restored = canonical.foundation.memory.pendingChains.root_stress_followup;
  assert(restored && restored.sourceEventId === 'drooping_leaves_warning', 'Expected restore normalization of legacy pending chain');
  assert(!canonical.foundation.memory.pendingChains.bad_entry, 'Expected malformed chain pruned during canonicalization');

  console.log('pending-chain lifecycle verification passed');
})();
