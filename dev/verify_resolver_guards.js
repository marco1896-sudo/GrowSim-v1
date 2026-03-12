'use strict';

const resolverApi = require('../src/events/eventResolver.js');
const { resolveNextEvent, applyGuardPipeline } = resolverApi;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const catalog = [
  { id: 'drooping_leaves_warning', allowedPhases: ['seedling', 'vegetative', 'flowering'], tone: 'negative', category: 'water' },
  { id: 'root_stress_followup', allowedPhases: ['seedling', 'vegetative', 'flowering'], tone: 'negative', category: 'disease', isFollowUp: true },
  { id: 'stable_growth_reward', allowedPhases: ['seedling', 'vegetative', 'flowering', 'harvest'], tone: 'positive', category: 'positive' }
];

function createMemory({ recentEvents = [], pendingChains = {}, lastDecision = null } = {}) {
  return {
    getLastEvents: (count) => recentEvents.slice(Math.max(0, recentEvents.length - (Number(count) || 0))),
    getPendingChains: () => ({ ...pendingChains }),
    getLastDecision: () => lastDecision
  };
}

(function run() {
  // 1) phase guard filters out-of-phase event candidates.
  const phaseFiltered = applyGuardPipeline([
    { eventId: 'drooping_leaves_warning', reason: 'condition:high_water', priority: 80, isFollowUp: false }
  ], {
    phase: 'harvest',
    catalog,
    memory: createMemory(),
    repeatWindow: 3
  });
  assert(phaseFiltered.length === 1 && phaseFiltered[0].eventId === 'drooping_leaves_warning', 'Expected fallback to keep original list when phase filtering empties candidates');

  const phaseMixed = applyGuardPipeline([
    { eventId: 'drooping_leaves_warning', reason: 'condition:high_water', priority: 80, isFollowUp: false },
    { eventId: 'stable_growth_reward', reason: 'condition:stable_growth', priority: 40, isFollowUp: false }
  ], {
    phase: 'harvest',
    catalog,
    memory: createMemory(),
    repeatWindow: 3
  });
  assert(phaseMixed.length === 1 && phaseMixed[0].eventId === 'stable_growth_reward', 'Expected out-of-phase candidate removed when at least one valid candidate remains');

  // 2) anti-repeat guard filters events seen in repeatWindow=3.
  const antiRepeatFiltered = applyGuardPipeline([
    { eventId: 'drooping_leaves_warning', reason: 'condition:high_water', priority: 80, isFollowUp: false },
    { eventId: 'stable_growth_reward', reason: 'condition:stable_growth', priority: 40, isFollowUp: false }
  ], {
    phase: 'vegetative',
    catalog,
    memory: createMemory({ recentEvents: [{ eventId: 'drooping_leaves_warning' }, { eventId: 'unknown_neutral' }, { eventId: 'root_stress_followup' }] }),
    repeatWindow: 3
  });
  assert(antiRepeatFiltered.length === 1 && antiRepeatFiltered[0].eventId === 'stable_growth_reward', 'Expected repeated event in last 3 to be filtered out');

  // 3) frustration guard blocks third negative event.
  const frustrationFiltered = applyGuardPipeline([
    { eventId: 'drooping_leaves_warning', reason: 'condition:high_water', priority: 80, isFollowUp: false },
    { eventId: 'stable_growth_reward', reason: 'condition:stable_growth', priority: 40, isFollowUp: false }
  ], {
    phase: 'vegetative',
    catalog,
    memory: createMemory({ recentEvents: [{ eventId: 'root_stress_followup' }, { eventId: 'drooping_leaves_warning' }] }),
    repeatWindow: 3
  });
  assert(frustrationFiltered.length === 1 && frustrationFiltered[0].eventId === 'stable_growth_reward', 'Expected third negative candidate to be blocked by frustration guard');

  // 4) pending-chain events bypass guards.
  const forcedPending = resolveNextEvent({
    state: { phase: 'harvest', water: 92, nutrients: 60, vitality: 70, stress: 30, pestPressure: 20 },
    flags: [],
    memory: createMemory({
      pendingChains: {
        root_stress_followup: {
          chainId: 'root_stress_followup',
          targetEventId: 'root_stress_followup',
          createdAtRealTimeMs: 1000
        }
      },
      recentEvents: [{ eventId: 'root_stress_followup' }, { eventId: 'drooping_leaves_warning' }, { eventId: 'root_stress_followup' }]
    }),
    catalog
  });
  assert(forcedPending.eventId === 'root_stress_followup', 'Expected forced pending-chain follow-up to bypass guard filtering');

  // 5) fallback logic prevents empty candidate deadlock.
  const fallbackSelection = resolveNextEvent({
    state: { phase: 'harvest', water: 92, nutrients: 30, vitality: 40, stress: 70, pestPressure: 60 },
    flags: [],
    memory: createMemory(),
    catalog
  });
  assert(fallbackSelection.eventId === 'drooping_leaves_warning', 'Expected resolver fallback to original candidate list instead of deadlock');

  console.log('resolver guards verification passed');
})();
