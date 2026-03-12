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

  function isPhaseAllowed(eventDef, phase) {
    const allowed = Array.isArray(eventDef && eventDef.allowedPhases)
      ? eventDef.allowedPhases.map(String)
      : [];
    if (!allowed.length) return true;
    return allowed.includes(String(phase || ''));
  }

  function findCatalogEvent(catalog, eventId) {
    if (!eventId) return null;
    const list = Array.isArray(catalog) ? catalog : [];
    return list.find((eventDef) => eventDef && eventDef.id === eventId) || null;
  }

  function getRecentEvents(memory, count = 3) {
    if (!memory || typeof memory.getLastEvents !== 'function') return [];
    const recent = memory.getLastEvents(count);
    return Array.isArray(recent) ? recent : [];
  }

  function getRecentAnalysisEntries(memory, count = 3) {
    if (!memory || typeof memory.getRecentAnalysis !== 'function') return [];
    const recent = memory.getRecentAnalysis(count);
    return Array.isArray(recent) ? recent : [];
  }

  function isEventNegative(eventDef) {
    const tone = String((eventDef && eventDef.tone) || '').toLowerCase();
    const category = String((eventDef && eventDef.category) || 'generic').toLowerCase();
    if (tone === 'positive' || category === 'positive') return false;
    return true;
  }

  function countRecentNegativePressure(memory, catalog) {
    const recentAnalysis = getRecentAnalysisEntries(memory, 3);
    if (recentAnalysis.length) {
      return recentAnalysis.filter((entry) => {
        const tone = String((entry && entry.tone) || '').toLowerCase();
        return tone === 'negative' || tone === 'warning';
      }).length;
    }

    const recentEvents = getRecentEvents(memory, 3);
    return recentEvents.filter((entry) => {
      const eventDef = findCatalogEvent(catalog, entry && entry.eventId);
      return isEventNegative(eventDef);
    }).length;
  }

  function isImmediateRepeat(memory, eventId) {
    const recent = getRecentEvents(memory, 1);
    return Boolean(recent.length && recent[0] && recent[0].eventId === String(eventId));
  }

  function finalizeCandidate(candidate, phase, catalog, memory, options = {}) {
    if (!candidate || !candidate.eventId) {
      return {
        eventId: null,
        reason: candidate && candidate.reason ? candidate.reason : 'no_match',
        priority: 0
      };
    }

    const eventDef = findCatalogEvent(catalog, candidate.eventId);
    if (!eventDef) {
      return { eventId: null, reason: 'missing_catalog_event', priority: 0 };
    }

    if (!isPhaseAllowed(eventDef, phase)) {
      return { eventId: null, reason: `phase_blocked:${candidate.eventId}`, priority: 0 };
    }

    const followUpForced = options.followUpForced === true || eventDef.isFollowUp === true;
    if (!followUpForced && isImmediateRepeat(memory, candidate.eventId)) {
      return { eventId: null, reason: `anti_repeat_blocked:${candidate.eventId}`, priority: 0 };
    }

    const negativePressure = countRecentNegativePressure(memory, catalog);
    const stableRewardDef = findCatalogEvent(catalog, 'stable_growth_reward');
    const stableEligible = stableRewardDef
      && isPhaseAllowed(stableRewardDef, phase)
      && isStableGrowthCondition(options.state || {});

    if (!followUpForced && negativePressure >= 2 && isEventNegative(eventDef) && stableEligible && candidate.eventId !== 'stable_growth_reward') {
      return {
        eventId: 'stable_growth_reward',
        reason: `anti_frustration_stable_override:${candidate.eventId}`,
        priority: Math.max(1, Number(candidate.priority) || 0)
      };
    }

    return candidate;
  }


  function getMostRecentPendingChain(memory) {
    if (!memory || typeof memory.getPendingChains !== 'function') return null;
    const pending = memory.getPendingChains();
    if (!pending || typeof pending !== 'object') return null;

    return Object.values(pending)
      .filter((entry) => entry && typeof entry === 'object' && entry.targetEventId)
      .sort((a, b) => Number(b.createdAtRealTimeMs || 0) - Number(a.createdAtRealTimeMs || 0))[0] || null;
  }

  function resolveNextEvent({ state, flags, memory, catalog }) {
    const flagSet = new Set(Array.isArray(flags) ? flags : []);
    const phase = String((state && state.phase) || 'seedling');

    const pendingChain = getMostRecentPendingChain(memory);
    if (pendingChain && pendingChain.targetEventId) {
      const pendingCandidate = finalizeCandidate({
        eventId: String(pendingChain.targetEventId),
        reason: `pending_chain:${String(pendingChain.chainId || pendingChain.targetEventId)}`,
        priority: 95
      }, phase, catalog, memory, { followUpForced: true, state });
      if (pendingCandidate && pendingCandidate.eventId) {
        return pendingCandidate;
      }
    }

    if (flagSet.has('root_stress_pending')) {
      return finalizeCandidate({
        eventId: 'root_stress_followup',
        reason: 'flag:root_stress_pending',
        priority: 100
      }, phase, catalog, memory, { followUpForced: true, state });
    }

    if (Number(state && state.water) > DEFAULT_THRESHOLDS.highWater) {
      return finalizeCandidate({
        eventId: 'drooping_leaves_warning',
        reason: 'condition:high_water',
        priority: 80
      }, phase, catalog, memory, { state });
    }

    if (isStableGrowthCondition(state)) {
      return finalizeCandidate({
        eventId: 'stable_growth_reward',
        reason: 'condition:stable_growth',
        priority: 40
      }, phase, catalog, memory, { state });
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
    isPhaseAllowed,
    resolveNextEvent
  });

  globalScope.GrowSimEventResolver = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
