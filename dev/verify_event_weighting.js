'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const resolverApi = require('../src/events/eventResolver.js');
const replay = require('./run_resolver_replay.js');

function createMemory({ recentEvents = [], pendingChains = {}, lastDecision = null } = {}) {
  return {
    getLastEvents: (count) => recentEvents.slice(Math.max(0, recentEvents.length - (Number(count) || 0))),
    getPendingChains: () => ({ ...pendingChains }),
    getLastDecision: () => lastDecision
  };
}

function verifyWeightMetadataParsed() {
  const catalogPath = path.join(__dirname, '..', 'data', 'events.foundation.json');
  const raw = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const events = Array.isArray(raw && raw.events) ? raw.events : [];
  const drooping = events.find((e) => e && e.id === 'drooping_leaves_warning');
  const stable = events.find((e) => e && e.id === 'stable_growth_reward');

  assert(drooping, 'drooping_leaves_warning missing in foundation catalog');
  assert.strictEqual(Number(drooping.weight), 5, 'drooping_leaves_warning weight should be 5');
  assert(stable, 'stable_growth_reward missing in foundation catalog');
  assert.strictEqual(Number(stable.weight), 1, 'stable_growth_reward weight should be 1');
}

function verifyWeightedSelectionExecuted() {
  const catalog = [
    { id: 'eventA', weight: 5 },
    { id: 'eventB', weight: 1 },
    { id: 'eventC' }
  ];

  const candidates = [
    { eventId: 'eventA' },
    { eventId: 'eventB' },
    { eventId: 'eventC' }
  ];

  const low = resolverApi.selectWeightedCandidate(candidates, catalog, () => 0.05);
  assert.strictEqual(low.selected.eventId, 'eventA', 'low weighted roll should pick high-weight candidate');

  const mid = resolverApi.selectWeightedCandidate(candidates, catalog, () => 0.86);
  assert.strictEqual(mid.selected.eventId, 'eventC', 'late weighted roll should pick tail candidate');

  assert.strictEqual(low.weights.eventA, 5, 'weight map should include explicit weight value');
  assert.strictEqual(low.weights.eventB, 1, 'weight map should include explicit weight value');
  assert.strictEqual(low.weights.eventC, 1, 'weight map should default missing weight to 1');
  assert(Number.isFinite(low.weightedRoll), 'weighted selection should emit numeric roll');
}

function verifyReplayTraceStable() {
  const runArgs = {
    ticks: 25,
    seed: 222,
    phase: 'seedling',
    catalogFiles: ['data/events.foundation.json']
  };

  const firstTrace = replay.runReplay(runArgs);
  const secondTrace = replay.runReplay(runArgs);

  assert.deepStrictEqual(firstTrace, secondTrace, 'replay trace should be deterministic for same seed');

  const tickWithCandidates = firstTrace.ticks.find((tick) => Array.isArray(tick.candidates) && tick.candidates.length > 1);
  if (tickWithCandidates) {
    assert(tickWithCandidates.weights && typeof tickWithCandidates.weights === 'object', 'trace tick should include weights map');
    assert('weightedRoll' in tickWithCandidates, 'trace tick should include weightedRoll field');
  }
}

(function main() {
  verifyWeightMetadataParsed();
  verifyWeightedSelectionExecuted();
  verifyReplayTraceStable();
  console.log('event weighting verification passed');
})();
