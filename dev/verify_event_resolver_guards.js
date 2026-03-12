'use strict';

const { resolveNextEvent } = require('../src/events/eventResolver.js');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const catalog = [
  { id: 'drooping_leaves_warning', allowedPhases: ['seedling', 'vegetative', 'flowering'], category: 'water', tone: 'warning', isFollowUp: false },
  { id: 'root_stress_followup', allowedPhases: ['seedling', 'vegetative', 'flowering'], category: 'disease', tone: 'negative', isFollowUp: true },
  { id: 'stable_growth_reward', allowedPhases: ['seedling', 'vegetative', 'flowering', 'harvest'], category: 'positive', tone: 'positive', isFollowUp: false }
];

function createMemory({ recentEvents = [], recentAnalysis = [], lastDecision = null } = {}) {
  return {
    getLastEvents: (count) => recentEvents.slice(Math.max(0, recentEvents.length - (Number(count) || 0))),
    getRecentAnalysis: (count) => recentAnalysis.slice(Math.max(0, recentAnalysis.length - (Number(count) || 0))),
    getLastDecision: () => lastDecision
  };
}

(function run() {
  // 1) phase block
  const phaseBlocked = resolveNextEvent({
    state: { phase: 'harvest', water: 92, nutrients: 60, vitality: 80, stress: 20, pestPressure: 20 },
    flags: [],
    memory: createMemory(),
    catalog
  });
  assert(phaseBlocked.eventId === null, 'Expected high-water warning blocked in harvest phase');
  assert(String(phaseBlocked.reason).startsWith('phase_blocked:'), 'Expected phase_blocked reason');

  // 2) anti-repeat for non-follow-up
  const antiRepeat = resolveNextEvent({
    state: { phase: 'vegetative', water: 91, nutrients: 60, vitality: 80, stress: 20, pestPressure: 20 },
    flags: [],
    memory: createMemory({ recentEvents: [{ eventId: 'drooping_leaves_warning' }] }),
    catalog
  });
  assert(antiRepeat.eventId === null, 'Expected immediate duplicate event to be blocked');
  assert(String(antiRepeat.reason).startsWith('anti_repeat_blocked:'), 'Expected anti-repeat reason');

  // 3) follow-up bypasses anti-repeat
  const followUpBypass = resolveNextEvent({
    state: { phase: 'vegetative', water: 91, nutrients: 60, vitality: 80, stress: 20, pestPressure: 20 },
    flags: ['root_stress_pending'],
    memory: createMemory({ recentEvents: [{ eventId: 'root_stress_followup' }] }),
    catalog
  });
  assert(followUpBypass.eventId === 'root_stress_followup', 'Expected follow-up to bypass anti-repeat when flag requires it');

  // 4) anti-frustration stable override
  const softened = resolveNextEvent({
    state: { phase: 'vegetative', water: 62, nutrients: 60, vitality: 84, stress: 19, pestPressure: 16 },
    flags: [],
    memory: createMemory({
      recentEvents: [{ eventId: 'drooping_leaves_warning' }, { eventId: 'root_stress_followup' }],
      recentAnalysis: [{ tone: 'warning' }, { tone: 'negative' }, { tone: 'warning' }]
    }),
    catalog
  });
  assert(softened.eventId === 'stable_growth_reward', 'Expected stable reward path under repeated negative pressure');

  console.log('event-resolver-guards verification passed');
})();
require('./verify_resolver_guards.js');
