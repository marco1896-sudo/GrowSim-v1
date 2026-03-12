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
    },
    repeatWindow: 3
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

  function getEventTone(eventDef) {
    const tone = String((eventDef && eventDef.tone) || 'neutral').toLowerCase();
    return ['positive', 'neutral', 'negative'].includes(tone) ? tone : 'neutral';
  }

  function isNegativeTone(eventDef) {
    return getEventTone(eventDef) === 'negative';
  }

  function areLastEventsNegative(memory, catalog, count = 2) {
    const recent = getRecentEvents(memory, count);
    if (recent.length < count) return false;

    return recent.every((entry) => {
      const eventDef = findCatalogEvent(catalog, entry && entry.eventId);
      return isNegativeTone(eventDef);
    });
  }

  function hasRepeatInWindow(memory, eventId, windowSize = DEFAULT_THRESHOLDS.repeatWindow) {
    if (!eventId) return false;
    const recent = getRecentEvents(memory, windowSize);
    const normalizedId = String(eventId);
    return recent.some((entry) => entry && String(entry.eventId) === normalizedId);
  }

  function getMostRecentPendingChain(memory) {
    if (!memory || typeof memory.getPendingChains !== 'function') return null;
    const pending = memory.getPendingChains();
    if (!pending || typeof pending !== 'object') return null;

    return Object.values(pending)
      .filter((entry) => entry && typeof entry === 'object' && entry.targetEventId)
      .sort((a, b) => Number(b.createdAtRealTimeMs || 0) - Number(a.createdAtRealTimeMs || 0))[0] || null;
  }

  function applyPhaseGuard(candidates, context) {
    const { phase, catalog } = context;
    return candidates.filter((candidate) => {
      if (candidate.followUpForced === true) return true;
      const eventDef = findCatalogEvent(catalog, candidate.eventId);
      return Boolean(eventDef && isPhaseAllowed(eventDef, phase));
    });
  }

  function applyRepeatGuard(candidates, context) {
    const { memory, repeatWindow } = context;
    return candidates.filter((candidate) => {
      if (candidate.followUpForced === true) return true;
      if (candidate.isFollowUp === true) return true;
      return !hasRepeatInWindow(memory, candidate.eventId, repeatWindow);
    });
  }

  function applyFrustrationGuard(candidates, context) {
    const { memory, catalog } = context;
    const hasNegativeStreak = areLastEventsNegative(memory, catalog, 2);
    if (!hasNegativeStreak) {
      return candidates;
    }

    return candidates.filter((candidate) => {
      if (candidate.followUpForced === true) return true;
      if (candidate.isFollowUp === true) return true;
      if (candidate.allowNegativeStreakOverride === true) return true;

      const eventDef = findCatalogEvent(catalog, candidate.eventId);
      return !isNegativeTone(eventDef);
    });
  }

  function traceGuardPipeline(candidates, context) {
    const original = Array.isArray(candidates) ? candidates.slice() : [];
    if (!original.length) {
      return {
        original,
        afterPhaseGuard: [],
        afterRepeatGuard: [],
        afterFrustrationGuard: [],
        final: [],
        fellBackToOriginal: false
      };
    }

    const afterPhaseGuard = applyPhaseGuard(original, context);
    const afterRepeatGuard = applyRepeatGuard(afterPhaseGuard, context);
    const afterFrustrationGuard = applyFrustrationGuard(afterRepeatGuard, context);
    const fellBackToOriginal = !afterFrustrationGuard.length;

    return {
      original,
      afterPhaseGuard,
      afterRepeatGuard,
      afterFrustrationGuard,
      final: fellBackToOriginal ? original : afterFrustrationGuard,
      fellBackToOriginal
    };
  }

  function applyGuardPipeline(candidates, context) {
    return traceGuardPipeline(candidates, context).final;
  }

  function finalizeCandidate(candidate, phase, catalog) {
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
    return {
      ...candidate,
      tone: getEventTone(eventDef)
    };
  }

  function resolveNextEventWithTrace({ state, flags, memory, catalog }) {
    const flagSet = new Set(Array.isArray(flags) ? flags : []);
    const phase = String((state && state.phase) || 'seedling');

    const pendingChain = getMostRecentPendingChain(memory);
    if (pendingChain && pendingChain.targetEventId) {
      const decision = finalizeCandidate({
        eventId: String(pendingChain.targetEventId),
        reason: `pending_chain:${String(pendingChain.chainId || pendingChain.targetEventId)}`,
        priority: 95,
        followUpForced: true,
        isFollowUp: true
      }, phase, catalog);
      return {
        decision,
        trace: {
          pendingChainOverride: true,
          pendingChainId: String(pendingChain.chainId || pendingChain.targetEventId),
          candidates: [],
          afterPhaseGuard: [],
          afterRepeatGuard: [],
          afterFrustrationGuard: []
        }
      };
    }

    if (flagSet.has('root_stress_pending')) {
      const decision = finalizeCandidate({
        eventId: 'root_stress_followup',
        reason: 'flag:root_stress_pending',
        priority: 100,
        followUpForced: true,
        isFollowUp: true
      }, phase, catalog);
      return {
        decision,
        trace: {
          pendingChainOverride: false,
          forcedByFlag: 'root_stress_pending',
          candidates: [],
          afterPhaseGuard: [],
          afterRepeatGuard: [],
          afterFrustrationGuard: []
        }
      };
    }

    const candidates = [];
    if (Number(state && state.water) > DEFAULT_THRESHOLDS.highWater) {
      candidates.push({
        eventId: 'drooping_leaves_warning',
        reason: 'condition:high_water',
        priority: 80,
        isFollowUp: false
      });
    }

    if (isStableGrowthCondition(state)) {
      candidates.push({
        eventId: 'stable_growth_reward',
        reason: 'condition:stable_growth',
        priority: 40,
        isFollowUp: false
      });
    }

    const pipelineTrace = traceGuardPipeline(candidates, {
      phase,
      catalog,
      memory,
      repeatWindow: DEFAULT_THRESHOLDS.repeatWindow
    });
    const guarded = pipelineTrace.final;

    if (guarded.length) {
      const selected = guarded
        .slice()
        .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))[0];

      return {
        decision: finalizeCandidate(selected, phase, catalog),
        trace: {
          pendingChainOverride: false,
          candidates: pipelineTrace.original,
          afterPhaseGuard: pipelineTrace.afterPhaseGuard,
          afterRepeatGuard: pipelineTrace.afterRepeatGuard,
          afterFrustrationGuard: pipelineTrace.afterFrustrationGuard,
          fellBackToOriginal: pipelineTrace.fellBackToOriginal
        }
      };
    }

    const lastDecision = memory && typeof memory.getLastDecision === 'function'
      ? memory.getLastDecision()
      : null;

    return {
      decision: {
        eventId: null,
        reason: lastDecision ? 'no_match_after_decision' : 'no_match',
        priority: 0
      },
      trace: {
        pendingChainOverride: false,
        candidates: pipelineTrace.original,
        afterPhaseGuard: pipelineTrace.afterPhaseGuard,
        afterRepeatGuard: pipelineTrace.afterRepeatGuard,
        afterFrustrationGuard: pipelineTrace.afterFrustrationGuard,
        fellBackToOriginal: pipelineTrace.fellBackToOriginal
      }
    };
  }

  function resolveNextEvent(input) {
    return resolveNextEventWithTrace(input).decision;
  }

  const api = Object.freeze({
    DEFAULT_THRESHOLDS,
    isStableGrowthCondition,
    isPhaseAllowed,
    resolveNextEvent,
    resolveNextEventWithTrace,
    applyGuardPipeline,
    traceGuardPipeline
  });

  globalScope.GrowSimEventResolver = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
