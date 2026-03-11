'use strict';

const { buildNormalizedPlantState } = require('../src/simulation/plantState.js');
const flagsApi = require('../src/events/eventFlags.js');
const memoryApi = require('../src/events/eventMemory.js');
const analysisApi = require('../src/events/eventAnalysis.js');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function hasCoreParts(entry) {
  return Boolean(entry && entry.actionText && entry.causeText && entry.resultText && entry.guidanceText);
}

(function run() {
  const runtime = {
    status: { health: 80, stress: 20, water: 90, nutrition: 60, risk: 20 },
    plant: { phase: 'vegetative', lifecycle: { qualityScore: 74 } },
    simulation: { tickCount: 101, simTimeMs: 123456 },
    events: { foundation: { flags: {}, memory: { events: [], decisions: [], pendingChains: {} }, analysis: [] } }
  };

  flagsApi.setFlag(runtime.events, 'root_stress_pending', true);
  memoryApi.addDecision(runtime.events, 'drooping_leaves_warning', 'ignore_signals', { source: 'verify' });

  const negativeEntry = analysisApi.generateAndStoreAnalysis(runtime.events, {
    eventId: 'drooping_leaves_warning',
    optionId: 'ignore_signals',
    atRealTimeMs: 111,
    atSimTimeMs: runtime.simulation.simTimeMs,
    tick: runtime.simulation.tickCount,
    relatedFlags: flagsApi.getActiveFlags(runtime.events),
    normalizedState: buildNormalizedPlantState(runtime)
  });

  assert(hasCoreParts(negativeEntry), 'Analysis must contain action/cause/result/guidance');
  assert(negativeEntry.tone === 'warning', 'Negative path should have warning tone');
  assert(/Wurzelstress|Stresskette/i.test(negativeEntry.resultText), 'Negative result should mention causal follow-up risk');

  flagsApi.clearFlag(runtime.events, 'root_stress_pending');
  runtime.status.water = 60;
  runtime.status.nutrition = 62;
  runtime.status.health = 86;
  runtime.status.stress = 18;
  runtime.status.risk = 15;

  const positiveEntry = analysisApi.generateAndStoreAnalysis(runtime.events, {
    eventId: 'stable_growth_reward',
    optionId: 'keep_current_plan',
    atRealTimeMs: 222,
    atSimTimeMs: runtime.simulation.simTimeMs + 100,
    tick: runtime.simulation.tickCount + 1,
    relatedFlags: flagsApi.getActiveFlags(runtime.events),
    normalizedState: buildNormalizedPlantState(runtime)
  });

  assert(hasCoreParts(positiveEntry), 'Positive analysis must contain core parts');
  assert(positiveEntry.tone === 'positive', 'Stable path should produce positive tone');
  assert(/stabil|Rhythmus|Wachstum/i.test(positiveEntry.resultText), 'Positive result should mention stable causal outcome');
  assert(analysisApi.getLatestAnalysis(runtime.events).analysisId === positiveEntry.analysisId, 'Latest analysis accessor should return newest entry');

  console.log('event-analysis verification passed');
})();
