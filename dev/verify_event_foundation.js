'use strict';

const { buildNormalizedPlantState } = require('../src/simulation/plantState.js');
const flagsApi = require('../src/events/eventFlags.js');
const memoryApi = require('../src/events/eventMemory.js');
const { resolveNextEvent } = require('../src/events/eventResolver.js');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const catalog = [
  { id: 'drooping_leaves_warning', allowedPhases: ['vegetative'], category: 'water', tone: 'warning', isFollowUp: false },
  { id: 'root_stress_followup', allowedPhases: ['vegetative'], category: 'disease', tone: 'negative', isFollowUp: true },
  { id: 'stable_growth_reward', allowedPhases: ['vegetative'], category: 'positive', tone: 'positive', isFollowUp: false }
];

function createMockRootState(overrides = {}) {
  return {
    status: { health: 80, stress: 20, water: 68, nutrition: 66, risk: 18, ...(overrides.status || {}) },
    plant: { phase: 'vegetative', lifecycle: { qualityScore: 72 }, ...(overrides.plant || {}) },
    simulation: { tickCount: 1234, ...(overrides.simulation || {}) }
  };
}

(function runVerification() {
  const runtime = { events: { foundation: { flags: {}, memory: { events: [], decisions: [], pendingChains: {} } } } };

  const highWaterState = buildNormalizedPlantState(createMockRootState({ status: { water: 91 } }));
  const firstResolution = resolveNextEvent({
    state: highWaterState,
    flags: flagsApi.getActiveFlags(runtime.events),
    memory: { getLastDecision: () => memoryApi.getLastDecision(runtime.events), getLastEvents: (count) => memoryApi.getLastEvents(runtime.events, count) },
    catalog
  });
  assert(firstResolution.eventId === 'drooping_leaves_warning', 'Expected high-water to resolve drooping warning');

  memoryApi.addDecision(runtime.events, 'drooping_leaves_warning', 'ignore_signals', { source: 'test' });
  flagsApi.setFlag(runtime.events, 'root_stress_pending', true);
  assert(flagsApi.hasFlag(runtime.events, 'root_stress_pending'), 'Expected root_stress_pending to be active');

  const followUpResolution = resolveNextEvent({
    state: highWaterState,
    flags: flagsApi.getActiveFlags(runtime.events),
    memory: { getLastDecision: () => memoryApi.getLastDecision(runtime.events), getLastEvents: (count) => memoryApi.getLastEvents(runtime.events, count) },
    catalog
  });
  assert(followUpResolution.eventId === 'root_stress_followup', 'Expected root stress follow-up to be prioritized');

  flagsApi.clearFlag(runtime.events, 'root_stress_pending');
  const stableState = buildNormalizedPlantState(createMockRootState({ status: { water: 60, nutrition: 62, health: 84, stress: 18, risk: 15 } }));
  const stableResolution = resolveNextEvent({
    state: stableState,
    flags: flagsApi.getActiveFlags(runtime.events),
    memory: { getLastDecision: () => memoryApi.getLastDecision(runtime.events), getLastEvents: (count) => memoryApi.getLastEvents(runtime.events, count) },
    catalog
  });
  assert(stableResolution.eventId === 'stable_growth_reward', 'Expected stable conditions to resolve stable reward');

  console.log('event-foundation verification passed');
})();
