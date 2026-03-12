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

  function getCandidateWeight(candidate, catalog) {
    const eventDef = findCatalogEvent(catalog, candidate && candidate.eventId);
    const rawWeight = Number(eventDef && eventDef.weight);
    if (!Number.isFinite(rawWeight) || rawWeight <= 0) {
      return 1;
    }
    return rawWeight;
  }



  function inferCandidatePool(candidate, catalog) {
    const eventDef = findCatalogEvent(catalog, candidate && candidate.eventId) || {};
    const explicitPool = String(eventDef.pool || '').trim().toLowerCase();
    if (explicitPool) {
      return explicitPool;
    }

    const tags = Array.isArray(eventDef.tags) ? eventDef.tags.map((tag) => String(tag).toLowerCase()) : [];
    const tone = getEventTone(eventDef);
    const category = String(eventDef.category || '').toLowerCase();

    if (tags.includes('rare')) return 'rare';
    if (eventDef.isFollowUp === true || (candidate && candidate.isFollowUp === true)) return 'recovery';
    if (tags.includes('reward') || tone === 'positive' || category === 'positive') return 'reward';
    if (tone === 'negative' || ['disease', 'pest', 'water', 'nutrition', 'environment'].includes(category)) return 'warning';
    return 'stress';
  }

  function groupCandidatesByPool(candidates, catalog) {
    const groups = {};
    const list = Array.isArray(candidates) ? candidates : [];
    for (const candidate of list) {
      const pool = inferCandidatePool(candidate, catalog);
      if (!groups[pool]) {
        groups[pool] = [];
      }
      groups[pool].push(candidate);
    }
    return groups;
  }

  function getPoolPreferenceMultiplier(poolName, context) {
    const pool = String(poolName || '').toLowerCase();
    if (pool === 'rare') {
      return 0.35;
    }

    const negativeHeavy = areLastEventsNegative(context && context.memory, context && context.catalog, 2);
    if (negativeHeavy && (pool === 'recovery' || pool === 'reward')) {
      return 2.5;
    }

    return 1;
  }

  function selectWeightedPool(poolGroups, catalog, memory, randomFn) {
    const names = Object.keys(poolGroups || {});
    if (!names.length) {
      return {
        selectedPool: null,
        selectedCandidates: [],
        availablePools: [],
        poolWeights: {},
        poolRoll: null,
        poolReason: 'no_pools'
      };
    }

    const weightedPools = names.map((poolName) => {
      const candidates = Array.isArray(poolGroups[poolName]) ? poolGroups[poolName] : [];
      const eventWeightSum = candidates.reduce((sum, candidate) => sum + getCandidateWeight(candidate, catalog), 0);
      const multiplier = getPoolPreferenceMultiplier(poolName, { memory, catalog });
      return {
        poolName,
        candidates,
        weight: eventWeightSum * multiplier,
        multiplier
      };
    }).filter((entry) => entry.weight > 0);

    if (!weightedPools.length) {
      return {
        selectedPool: names.sort()[0],
        selectedCandidates: poolGroups[names.sort()[0]] || [],
        availablePools: names.slice().sort(),
        poolWeights: {},
        poolRoll: null,
        poolReason: 'zero_weight_fallback'
      };
    }

    const normalizedRandomFn = typeof randomFn === 'function' ? randomFn : (() => 0);
    const totalWeight = weightedPools.reduce((sum, row) => sum + row.weight, 0);
    const rollUnit = Math.max(0, Math.min(1 - Number.EPSILON, Number(normalizedRandomFn()) || 0));
    const poolRoll = rollUnit * totalWeight;

    let cursor = poolRoll;
    let selected = weightedPools[weightedPools.length - 1];
    for (const row of weightedPools) {
      cursor -= row.weight;
      if (cursor < 0) {
        selected = row;
        break;
      }
    }

    const poolWeights = weightedPools.reduce((acc, row) => {
      acc[row.poolName] = Number(row.weight);
      return acc;
    }, {});

    return {
      selectedPool: selected.poolName,
      selectedCandidates: selected.candidates,
      availablePools: weightedPools.map((entry) => entry.poolName),
      poolWeights,
      poolRoll,
      poolReason: selected.multiplier > 1 ? 'negative_heavy_prefers_recovery_reward' : 'weighted_pool_selection'
    };
  }

  function selectWeightedCandidate(candidates, catalog, randomFn) {
    const list = Array.isArray(candidates) ? candidates : [];
    if (!list.length) {
      return {
        selected: null,
        weightedRoll: null,
        weights: {}
      };
    }

    const normalizedRandomFn = typeof randomFn === 'function' ? randomFn : (() => 0);
    const weighted = list.map((candidate) => ({
      candidate,
      weight: getCandidateWeight(candidate, catalog)
    }));
    const totalWeight = weighted.reduce((sum, row) => sum + row.weight, 0);
    const rollUnit = Math.max(0, Math.min(1 - Number.EPSILON, Number(normalizedRandomFn()) || 0));
    const weightedRoll = rollUnit * totalWeight;

    let cursor = weightedRoll;
    for (const row of weighted) {
      cursor -= row.weight;
      if (cursor < 0) {
        return {
          selected: row.candidate,
          weightedRoll,
          weights: weighted.reduce((acc, entry) => {
            acc[entry.candidate.eventId] = entry.weight;
            return acc;
          }, {})
        };
      }
    }

    return {
      selected: weighted[weighted.length - 1].candidate,
      weightedRoll,
      weights: weighted.reduce((acc, entry) => {
        acc[entry.candidate.eventId] = entry.weight;
        return acc;
      }, {})
    };
  }

  function resolveNextEventWithTrace({ state, flags, memory, catalog, random, sourceCandidates }) {
    const flagSet = new Set(Array.isArray(flags) ? flags : []);
    const phase = String((state && state.phase) || 'seedling');
    const sourceCandidateIds = new Set(
      (Array.isArray(sourceCandidates) ? sourceCandidates : [])
        .map((candidate) => String(candidate && candidate.eventId || ''))
        .filter(Boolean)
    );

    const pendingChain = getMostRecentPendingChain(memory);
    const pendingTargetId = pendingChain && pendingChain.targetEventId
      ? String(pendingChain.targetEventId)
      : '';
    const pendingTargetAllowed = !sourceCandidateIds.size || sourceCandidateIds.has(pendingTargetId);
    if (pendingChain && pendingTargetId && pendingTargetAllowed) {
      const decision = finalizeCandidate({
        eventId: pendingTargetId,
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
          afterFrustrationGuard: [],
          availablePools: [],
          selectedPool: null,
          poolWeights: {},
          poolRoll: null,
          poolReason: 'pending_chain_override',
          weights: {},
          weightedRoll: null
        }
      };
    }

    const forcedFlagTargetAllowed = !sourceCandidateIds.size || sourceCandidateIds.has('root_stress_followup');
    if (flagSet.has('root_stress_pending') && forcedFlagTargetAllowed) {
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
          afterFrustrationGuard: [],
          availablePools: [],
          selectedPool: null,
          poolWeights: {},
          poolRoll: null,
          poolReason: 'forced_flag_override',
          weights: {},
          weightedRoll: null
        }
      };
    }

    const candidates = [];
    const externalCandidates = Array.isArray(sourceCandidates) ? sourceCandidates : [];
    if (externalCandidates.length) {
      for (const candidate of externalCandidates) {
        if (!candidate || !candidate.eventId) {
          continue;
        }
        candidates.push({
          eventId: String(candidate.eventId),
          reason: candidate.reason || 'eligible_catalog',
          priority: Number.isFinite(Number(candidate.priority)) ? Number(candidate.priority) : 20,
          isFollowUp: candidate.isFollowUp === true,
          followUpForced: candidate.followUpForced === true,
          allowNegativeStreakOverride: candidate.allowNegativeStreakOverride === true
        });
      }
    } else {
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
    }

    const pipelineTrace = traceGuardPipeline(candidates, {
      phase,
      catalog,
      memory,
      repeatWindow: DEFAULT_THRESHOLDS.repeatWindow
    });
    const guarded = pipelineTrace.final;

    if (guarded.length) {
      const poolGroups = groupCandidatesByPool(guarded, catalog);
      const poolSelection = selectWeightedPool(poolGroups, catalog, memory, random);
      const weightedSelection = selectWeightedCandidate(poolSelection.selectedCandidates, catalog, random);
      const selected = weightedSelection.selected;

      return {
        decision: finalizeCandidate(selected, phase, catalog),
        trace: {
          pendingChainOverride: false,
          candidates: pipelineTrace.original,
          afterPhaseGuard: pipelineTrace.afterPhaseGuard,
          afterRepeatGuard: pipelineTrace.afterRepeatGuard,
          afterFrustrationGuard: pipelineTrace.afterFrustrationGuard,
          fellBackToOriginal: pipelineTrace.fellBackToOriginal,
          availablePools: poolSelection.availablePools,
          selectedPool: poolSelection.selectedPool,
          poolWeights: poolSelection.poolWeights,
          poolRoll: poolSelection.poolRoll,
          poolReason: poolSelection.poolReason,
          weights: weightedSelection.weights,
          weightedRoll: Number(weightedSelection.weightedRoll)
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
        fellBackToOriginal: pipelineTrace.fellBackToOriginal,
        availablePools: [],
        selectedPool: null,
        poolWeights: {},
        poolRoll: null,
        poolReason: 'no_candidates',
        weights: {},
        weightedRoll: null
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
    traceGuardPipeline,
    getCandidateWeight,
    inferCandidatePool,
    groupCandidatesByPool,
    getPoolPreferenceMultiplier,
    selectWeightedPool,
    selectWeightedCandidate
  });

  globalScope.GrowSimEventResolver = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
