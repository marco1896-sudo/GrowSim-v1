#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const plantStateApi = require('../src/simulation/plantState.js');
const flagsApi = require('../src/events/eventFlags.js');
const memoryApi = require('../src/events/eventMemory.js');
const resolverApi = require('../src/events/eventResolver.js');

function createMemory({ recentEvents = [], pendingChains = {}, lastDecision = null } = {}) {
  return {
    getLastEvents: (count) => recentEvents.slice(Math.max(0, recentEvents.length - (Number(count) || 0))),
    getPendingChains: () => ({ ...pendingChains }),
    getLastDecision: () => lastDecision
  };
}

const catalog = [
  {
    id: 'drooping_leaves_warning',
    title: 'Drooping leaves warning',
    description: 'Water pressure event',
    category: 'water',
    tone: 'negative',
    allowedPhases: ['vegetative'],
    options: [{ id: 'reduce_watering_now', label: 'Reduce', effects: { water: -8 } }]
  },
  {
    id: 'root_stress_followup',
    title: 'Root stress follow-up',
    description: 'Root stress escalated',
    category: 'disease',
    tone: 'negative',
    isFollowUp: true,
    allowedPhases: ['vegetative'],
    options: [{ id: 'recover_root_zone', label: 'Recover', effects: { stress: -6 }, followUps: ['clear_flag:root_stress_pending'] }]
  },
  {
    id: 'stable_growth_reward',
    title: 'Stable growth reward',
    description: 'Stable conditions',
    category: 'positive',
    tone: 'positive',
    allowedPhases: ['harvest', 'vegetative'],
    options: [{ id: 'keep_current_plan', label: 'Keep', effects: { health: 3 } }]
  }
];

(function testResolverGuards() {
  const phaseGuardResult = resolverApi.applyGuardPipeline([
    { eventId: 'drooping_leaves_warning', reason: 'condition:high_water', priority: 80, isFollowUp: false },
    { eventId: 'stable_growth_reward', reason: 'condition:stable_growth', priority: 40, isFollowUp: false }
  ], {
    phase: 'harvest',
    memory: createMemory(),
    catalog,
    repeatWindow: 3
  });
  assert.strictEqual(phaseGuardResult.length, 1, 'phase guard should keep only in-phase candidates');
  assert.strictEqual(phaseGuardResult[0].eventId, 'stable_growth_reward', 'phase guard should remove out-of-phase candidates before selection');

  const repeatGuardResult = resolverApi.applyGuardPipeline([
    { eventId: 'drooping_leaves_warning', reason: 'condition:high_water', priority: 80, isFollowUp: false },
    { eventId: 'stable_growth_reward', reason: 'condition:stable_growth', priority: 40, isFollowUp: false }
  ], {
    phase: 'vegetative',
    memory: createMemory({ recentEvents: [{ eventId: 'drooping_leaves_warning' }] }),
    catalog,
    repeatWindow: 3
  });
  assert.strictEqual(repeatGuardResult.length, 1, 'repeat guard should keep non-repeated candidates');
  assert.strictEqual(repeatGuardResult[0].eventId, 'stable_growth_reward', 'repeat guard should filter events present in repeat window');

  const frustrationGuardResult = resolverApi.applyGuardPipeline([
    { eventId: 'drooping_leaves_warning', reason: 'condition:high_water', priority: 80, isFollowUp: false },
    { eventId: 'stable_growth_reward', reason: 'condition:stable_growth', priority: 40, isFollowUp: false }
  ], {
    phase: 'vegetative',
    memory: createMemory({ recentEvents: [{ eventId: 'drooping_leaves_warning' }, { eventId: 'root_stress_followup' }] }),
    catalog,
    repeatWindow: 3
  });
  assert.strictEqual(frustrationGuardResult.length, 1, 'frustration guard should keep non-negative candidates after streak');
  assert.strictEqual(frustrationGuardResult[0].eventId, 'stable_growth_reward', 'frustration guard should block third negative event');

  const pendingBypassResult = resolverApi.resolveNextEvent({
    state: { phase: 'harvest', water: 90, nutrients: 20, vitality: 30, stress: 80, pestPressure: 70 },
    flags: [],
    memory: createMemory({
      recentEvents: [
        { eventId: 'drooping_leaves_warning' },
        { eventId: 'root_stress_followup' },
        { eventId: 'drooping_leaves_warning' }
      ],
      pendingChains: {
        root_stress_followup: {
          chainId: 'root_stress_followup',
          targetEventId: 'root_stress_followup',
          createdAtRealTimeMs: 1234
        }
      }
    }),
    catalog
  });
  assert.strictEqual(pendingBypassResult.eventId, 'root_stress_followup', 'pending chain should bypass guard filtering');

  const fallbackResult = resolverApi.resolveNextEvent({
    state: { phase: 'harvest', water: 90, nutrients: 20, vitality: 30, stress: 80, pestPressure: 70 },
    flags: [],
    memory: createMemory(),
    catalog
  });
  assert.strictEqual(fallbackResult.eventId, 'drooping_leaves_warning', 'fallback should return original candidates when guard filtering empties list');
})();

function loadEventsContext() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'events.js'), 'utf8');
  const context = {
    console,
    Date,
    Math,
    setTimeout,
    clearTimeout,
    clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
    round2: (v) => Math.round(Number(v || 0) * 100) / 100,
    deterministicUnitFloat: () => 0,
    deterministicRoll: () => 0,
    simDayFloat: () => 1,
    simHour: () => 12,
    eventThreshold: () => 1,
    EVENT_COOLDOWN_MS: 30 * 60 * 1000,
    EVENT_ROLL_MIN_REAL_MS: 1 * 60 * 1000,
    EVENT_ROLL_MAX_REAL_MS: 2 * 60 * 1000,
    nextDaytimeRealMs: (nowMs) => nowMs,
    schedulePushIfAllowed: () => {},
    schedulePersistState: () => {},
    renderAll: () => {},
    notifyPlantNeedsCare: () => {},
    addLog: () => {},
    isPlantDead: () => false,
    clampStatus: () => {},
    syncCanonicalStateShape: () => {},
    window: {
      GrowSimPlantState: plantStateApi,
      GrowSimEventFlags: flagsApi,
      GrowSimEventMemory: memoryApi,
      GrowSimEventResolver: resolverApi
    },
    state: {
      status: { water: 90, nutrition: 60, health: 80, stress: 20, risk: 20, growth: 0 },
      plant: { phase: 'vegetative', stageIndex: 1, stageKey: 'veg', lifecycle: { qualityScore: 70 } },
      simulation: { isDaytime: true, nowMs: 10_000, simTimeMs: 5_000, tickCount: 42 },
      setup: { mode: 'soil' },
      history: { events: [] },
      ui: { openSheet: null },
      events: {
        machineState: 'idle',
        scheduler: { nextEventRealTimeMs: 0, eventCooldowns: {}, categoryCooldowns: {}, lastEventId: null, lastEventRealTimeMs: 0 },
        catalog: JSON.parse(JSON.stringify(catalog)),
        foundation: {
          flags: {},
          memory: { events: [], decisions: [], pendingChains: {} },
          analysis: []
        },
        history: []
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'events.js' });
  return context;
}

(function testRuntimeSelectionUsesResolverPipeline() {
  const ctx = loadEventsContext();
  memoryApi.setPendingChain(ctx.state.events, 'root_stress_followup', {
    targetEventId: 'root_stress_followup',
    createdAtRealTimeMs: Date.now()
  });
  const activated = ctx.window.GrowSimEvents.activateEvent(ctx.state.simulation.nowMs);
  assert.strictEqual(activated, true, 'event activation should succeed');
  assert.strictEqual(ctx.state.events.activeEventId, 'root_stress_followup', 'runtime selection should honor resolver pending-chain bypass before deterministic fallback selection');
})();

console.log('event resolver guard integration test passed');
