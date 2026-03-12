'use strict';

const assert = require('assert');

const resolverApi = require('../src/events/eventResolver.js');
const replay = require('./run_resolver_replay.js');

function createMemory({ recentEvents = [], pendingChains = {}, lastDecision = null } = {}) {
  return {
    getLastEvents: (count) => recentEvents.slice(Math.max(0, recentEvents.length - (Number(count) || 0))),
    getPendingChains: () => ({ ...pendingChains }),
    getLastDecision: () => lastDecision
  };
}

function verifyPoolInference() {
  const catalog = [
    { id: 'explicit_warning', pool: 'warning', weight: 1 },
    { id: 'followup_event', isFollowUp: true, tone: 'negative', weight: 1 },
    { id: 'positive_reward', tone: 'positive', weight: 1 },
    { id: 'rare_tagged', tags: ['rare'], weight: 1 },
    { id: 'default_stress', tone: 'neutral', category: 'generic', weight: 1 }
  ];

  assert.strictEqual(resolverApi.inferCandidatePool({ eventId: 'explicit_warning' }, catalog), 'warning');
  assert.strictEqual(resolverApi.inferCandidatePool({ eventId: 'followup_event' }, catalog), 'recovery');
  assert.strictEqual(resolverApi.inferCandidatePool({ eventId: 'positive_reward' }, catalog), 'reward');
  assert.strictEqual(resolverApi.inferCandidatePool({ eventId: 'rare_tagged' }, catalog), 'rare');
  assert.strictEqual(resolverApi.inferCandidatePool({ eventId: 'default_stress' }, catalog), 'stress');
}

function verifyDeterministicPoolChoice() {
  const catalog = [
    { id: 'warning_event', pool: 'warning', weight: 1, tone: 'negative' },
    { id: 'reward_event', pool: 'reward', weight: 1, tone: 'positive' }
  ];

  const grouped = resolverApi.groupCandidatesByPool([
    { eventId: 'warning_event' },
    { eventId: 'reward_event' }
  ], catalog);

  const memory = createMemory({
    recentEvents: [{ eventId: 'warning_event' }, { eventId: 'warning_event' }]
  });

  const first = resolverApi.selectWeightedPool(grouped, catalog, memory, () => 0.3);
  const second = resolverApi.selectWeightedPool(grouped, catalog, memory, () => 0.3);
  assert.deepStrictEqual(first, second, 'pool selection must be deterministic for same random input');
  assert.strictEqual(first.selectedPool, 'reward', 'negative-heavy history should prefer reward/recovery pools');
}

function verifyWeightedSelectionInsideChosenPool() {
  const catalog = [
    { id: 'warning_a', pool: 'warning', weight: 1, tone: 'negative', allowedPhases: ['seedling'] },
    { id: 'warning_b', pool: 'warning', weight: 6, tone: 'negative', allowedPhases: ['seedling'] }
  ];

  const result = resolverApi.resolveNextEventWithTrace({
    state: { phase: 'seedling', water: 95, nutrients: 30, vitality: 40, stress: 70, pestPressure: 20 },
    flags: [],
    memory: createMemory(),
    catalog,
    random: () => 0.8
  });

  // Current candidate set can include only drooping/stable from foundation logic,
  // so directly validate weighted candidate helper for in-pool selection behavior.
  const weighted = resolverApi.selectWeightedCandidate([
    { eventId: 'warning_a' },
    { eventId: 'warning_b' }
  ], catalog, () => 0.75);
  assert.strictEqual(weighted.selected.eventId, 'warning_b');
  assert(result && result.trace, 'resolver should still return trace object');
}

function verifyPendingChainBypassesPools() {
  const catalog = [
    { id: 'root_stress_followup', pool: 'recovery', tone: 'negative', isFollowUp: true }
  ];

  const result = resolverApi.resolveNextEventWithTrace({
    state: { phase: 'seedling', water: 50, nutrients: 50, vitality: 50, stress: 50, pestPressure: 50 },
    flags: [],
    memory: createMemory({
      pendingChains: {
        root_stress_followup: {
          chainId: 'root_stress_followup',
          targetEventId: 'root_stress_followup',
          createdAtRealTimeMs: 123
        }
      }
    }),
    catalog,
    random: () => 0.4
  });

  assert.strictEqual(result.decision.eventId, 'root_stress_followup', 'pending-chain precedence must remain');
  assert.strictEqual(result.trace.selectedPool, null, 'pending chain path must bypass pool routing');
}

function verifyReplayTraceIncludesPoolFields() {
  const trace = replay.runReplay({
    ticks: 10,
    seed: 123,
    phase: 'seedling',
    catalogFiles: ['data/events.foundation.json']
  });

  const firstTick = trace.ticks[0];
  assert(firstTick && Object.prototype.hasOwnProperty.call(firstTick, 'availablePools'));
  assert(Object.prototype.hasOwnProperty.call(firstTick, 'selectedPool'));
  assert(Object.prototype.hasOwnProperty.call(firstTick, 'poolWeights'));
  assert(Object.prototype.hasOwnProperty.call(firstTick, 'poolRoll'));
  assert(Object.prototype.hasOwnProperty.call(firstTick, 'poolReason'));
}

(function main() {
  verifyPoolInference();
  verifyDeterministicPoolChoice();
  verifyWeightedSelectionInsideChosenPool();
  verifyPendingChainBypassesPools();
  verifyReplayTraceIncludesPoolFields();
  console.log('event pool verification passed');
})();
