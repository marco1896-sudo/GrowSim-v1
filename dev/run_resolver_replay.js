'use strict';

const fs = require('fs');
const path = require('path');

const resolver = require('../src/events/eventResolver.js');
const memoryApi = require('../src/events/eventMemory.js');
const flagsApi = require('../src/events/eventFlags.js');

const DEFAULT_CATALOG_FILES = [
  'data/events.foundation.json',
  'data/events.json',
  'data/events.v2.json'
];

function parseArgs(argv) {
  const args = {
    ticks: 50,
    seed: 123,
    out: path.join(__dirname, 'replay_trace.json'),
    phase: 'seedling'
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--ticks') {
      args.ticks = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--seed') {
      args.seed = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--out') {
      args.out = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--phase') {
      args.phase = String(argv[i + 1] || 'seedling');
      i += 1;
      continue;
    }
    if (token === '--catalog') {
      const catalogArg = String(argv[i + 1] || '');
      args.catalogFiles = catalogArg.split(',').map((entry) => entry.trim()).filter(Boolean);
      i += 1;
    }
  }

  if (!Number.isFinite(args.ticks) || args.ticks <= 0) {
    throw new Error('--ticks must be a positive number');
  }
  if (!Number.isFinite(args.seed)) {
    throw new Error('--seed must be a finite number');
  }
  return args;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function pickFromList(list, rng) {
  if (!Array.isArray(list) || !list.length) return null;
  const index = Math.floor(rng() * list.length);
  return list[Math.min(list.length - 1, Math.max(0, index))];
}

function loadCatalog(catalogFiles) {
  const files = Array.isArray(catalogFiles) && catalogFiles.length
    ? catalogFiles
    : DEFAULT_CATALOG_FILES;

  const root = path.join(__dirname, '..');
  const byId = new Map();

  for (const relPath of files) {
    const absPath = path.resolve(root, relPath);
    const raw = JSON.parse(fs.readFileSync(absPath, 'utf8'));
    const events = Array.isArray(raw && raw.events) ? raw.events : [];
    for (const eventDef of events) {
      if (!eventDef || !eventDef.id) continue;
      byId.set(String(eventDef.id), eventDef);
    }
  }

  return Array.from(byId.values()).sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function createMemoryFacade(eventsState) {
  return {
    getLastDecision: () => memoryApi.getLastDecision(eventsState),
    getLastEvents: (count) => memoryApi.getLastEvents(eventsState, count),
    getPendingChain: (chainId) => memoryApi.getPendingChain(eventsState, chainId),
    getPendingChains: () => memoryApi.getPendingChains(eventsState)
  };
}

function applyFollowUps(eventsState, selectedEventId, selectedOption) {
  const tokens = Array.isArray(selectedOption && selectedOption.followUps)
    ? selectedOption.followUps
    : [];

  for (const followUp of tokens) {
    const token = String(followUp || '');
    if (token.startsWith('set_flag:')) {
      const flagId = token.slice('set_flag:'.length);
      flagsApi.setFlag(eventsState, flagId, true);
      if (flagId === 'root_stress_pending') {
        memoryApi.setPendingChain(eventsState, 'root_stress_followup', {
          targetEventId: 'root_stress_followup',
          sourceEventId: selectedEventId,
          sourceOptionId: selectedOption.id,
          sourceFlagId: 'root_stress_pending',
          createdAtRealTimeMs: Date.now(),
          meta: { createdBy: 'resolver_replay_harness' }
        });
      }
      continue;
    }

    if (token.startsWith('clear_flag:')) {
      const flagId = token.slice('clear_flag:'.length);
      flagsApi.clearFlag(eventsState, flagId);
      if (flagId === 'root_stress_pending') {
        memoryApi.clearPendingChain(eventsState, 'root_stress_followup');
      }
      continue;
    }

    if (token.startsWith('set_chain:')) {
      const chainId = token.slice('set_chain:'.length);
      memoryApi.setPendingChain(eventsState, chainId, {
        targetEventId: chainId,
        sourceEventId: selectedEventId,
        sourceOptionId: selectedOption.id,
        createdAtRealTimeMs: Date.now(),
        meta: { createdBy: 'resolver_replay_harness' }
      });
      continue;
    }

    if (token.startsWith('clear_chain:')) {
      const chainId = token.slice('clear_chain:'.length);
      memoryApi.clearPendingChain(eventsState, chainId);
    }
  }
}

function buildInitialState(phase) {
  return {
    phase,
    water: 88,
    nutrients: 52,
    vitality: 70,
    stress: 26,
    pestPressure: 18
  };
}

function tickStateForward(state, rng) {
  const wave = (rng() * 2) - 1;
  state.water = Math.max(0, Math.min(100, state.water + (wave * 12)));
  state.nutrients = Math.max(0, Math.min(100, state.nutrients + ((rng() * 2) - 1) * 6));
  state.vitality = Math.max(0, Math.min(100, state.vitality + ((rng() * 2) - 1) * 4));
  state.stress = Math.max(0, Math.min(100, state.stress + ((rng() * 2) - 1) * 8));
  state.pestPressure = Math.max(0, Math.min(100, state.pestPressure + ((rng() * 2) - 1) * 5));
}

function runReplay({ ticks, seed, phase, catalogFiles }) {
  const rng = mulberry32(seed);
  const catalog = loadCatalog(catalogFiles);
  const eventsState = { foundation: { memory: {}, flags: {} } };
  const memory = createMemoryFacade(eventsState);
  const plantState = buildInitialState(phase);

  const trace = {
    seed,
    ticks: []
  };

  for (let tick = 1; tick <= ticks; tick += 1) {
    tickStateForward(plantState, rng);

    const activeFlags = flagsApi.getActiveFlags(eventsState);
    const resolution = resolver.resolveNextEventWithTrace({
      state: plantState,
      flags: activeFlags,
      memory,
      catalog,
      random: rng
    });

    const decision = resolution.decision;
    const eventDef = decision && decision.eventId
      ? catalog.find((entry) => entry && entry.id === decision.eventId) || null
      : null;

    let selectedOption = null;
    if (eventDef && Array.isArray(eventDef.options) && eventDef.options.length) {
      selectedOption = pickFromList(eventDef.options, rng);
    }

    if (decision && decision.eventId) {
      const consumedPending = memoryApi.consumePendingChain(eventsState, decision.eventId);
      memoryApi.addEvent(eventsState, decision.eventId, {
        replayTick: tick,
        consumedChainId: consumedPending ? consumedPending.chainId : null,
        replayReason: decision.reason
      });
      if (selectedOption) {
        memoryApi.addDecision(eventsState, decision.eventId, selectedOption.id, { replayTick: tick });
        applyFollowUps(eventsState, decision.eventId, selectedOption);
      }
    }

    trace.ticks.push({
      tick,
      state: {
        phase: plantState.phase,
        water: Number(plantState.water.toFixed(3)),
        nutrients: Number(plantState.nutrients.toFixed(3)),
        vitality: Number(plantState.vitality.toFixed(3)),
        stress: Number(plantState.stress.toFixed(3)),
        pestPressure: Number(plantState.pestPressure.toFixed(3))
      },
      activeFlags,
      candidates: (resolution.trace.candidates || []).map((entry) => entry.eventId),
      afterPhaseGuard: (resolution.trace.afterPhaseGuard || []).map((entry) => entry.eventId),
      afterRepeatGuard: (resolution.trace.afterRepeatGuard || []).map((entry) => entry.eventId),
      afterFrustrationGuard: (resolution.trace.afterFrustrationGuard || []).map((entry) => entry.eventId),
      pendingChainOverride: Boolean(resolution.trace.pendingChainOverride),
      pendingChainId: resolution.trace.pendingChainId || null,
      availablePools: Array.isArray(resolution.trace.availablePools) ? resolution.trace.availablePools : [],
      selectedPool: resolution.trace.selectedPool || null,
      poolWeights: resolution.trace.poolWeights || {},
      poolRoll: resolution.trace.poolRoll === null || resolution.trace.poolRoll === undefined
        ? null
        : Number(Number(resolution.trace.poolRoll).toFixed(6)),
      poolReason: resolution.trace.poolReason || null,
      weights: resolution.trace.weights || {},
      weightedRoll: resolution.trace.weightedRoll === null || resolution.trace.weightedRoll === undefined
        ? null
        : Number(Number(resolution.trace.weightedRoll).toFixed(6)),
      selectedEvent: decision ? decision.eventId : null,
      selectedReason: decision ? decision.reason : 'no_decision',
      selectedOptionId: selectedOption ? selectedOption.id : null
    });
  }

  return trace;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runReplay,
    parseArgs,
    loadCatalog,
    mulberry32
  };
}

(function main() {
  if (require.main !== module) {
    return;
  }

  const args = parseArgs(process.argv);
  const trace = runReplay(args);

  fs.writeFileSync(args.out, JSON.stringify(trace, null, 2));
  console.log(`resolver replay trace written: ${args.out}`);
  console.log(`seed=${args.seed} ticks=${args.ticks} selected=${trace.ticks.filter((t) => t.selectedEvent).length}`);
})();
