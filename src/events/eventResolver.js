'use strict';

(function initEventResolver(globalScope) {
  const DEFAULT_THRESHOLDS = Object.freeze({
    highWater: 82,
    stableMin: {
      water: 45,
      nutrients: 45,
      vitality: 65,
      stressMax: 35,
      pestPressureMax: 35
    }
  });

  function isStableGrowthCondition(state) {
    const s = state || {};
    return Number(s.water) >= DEFAULT_THRESHOLDS.stableMin.water
      && Number(s.water) <= 75
      && Number(s.nutrients) >= DEFAULT_THRESHOLDS.stableMin.nutrients
      && Number(s.vitality) >= DEFAULT_THRESHOLDS.stableMin.vitality
      && Number(s.stress) <= DEFAULT_THRESHOLDS.stableMin.stressMax
      && Number(s.pestPressure) <= DEFAULT_THRESHOLDS.stableMin.pestPressureMax;
  }

  function resolveNextEvent({ state, flags, memory }) {
    const flagSet = new Set(Array.isArray(flags) ? flags : []);

    if (flagSet.has('root_stress_pending')) {
      return {
        eventId: 'root_stress_followup',
        reason: 'flag:root_stress_pending',
        priority: 100
      };
    }

    if (Number(state && state.water) > DEFAULT_THRESHOLDS.highWater) {
      return {
        eventId: 'drooping_leaves_warning',
        reason: 'condition:high_water',
        priority: 80
      };
    }

    if (isStableGrowthCondition(state)) {
      return {
        eventId: 'stable_growth_reward',
        reason: 'condition:stable_growth',
        priority: 40
      };
    }

    const lastDecision = memory && typeof memory.getLastDecision === 'function'
      ? memory.getLastDecision()
      : null;

    return {
      eventId: null,
      reason: lastDecision ? 'no_match_after_decision' : 'no_match',
      priority: 0
    };
  }

  const api = Object.freeze({
    DEFAULT_THRESHOLDS,
    isStableGrowthCondition,
    resolveNextEvent
  });

  globalScope.GrowSimEventResolver = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
