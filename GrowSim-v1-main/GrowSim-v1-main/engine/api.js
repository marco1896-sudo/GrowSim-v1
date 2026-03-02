import { createInitialState, recoverOrInitState } from './state.js';
import { processOfflineTicks } from './clock.js';
import { createStorage } from './storage.js';

const subscribers = new Set();
let stateRef = null;
let storage = null;

async function loadRules() {
  try {
    const response = await fetch('./data/rules.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('rules.json not readable');
    const rules = await response.json();
    return {
      tick_seconds: Number.isInteger(rules.tick_seconds) ? rules.tick_seconds : 60,
      global_seed: typeof rules.global_seed === 'string' ? rules.global_seed : 'seed-default'
    };
  } catch (_error) {
    return {
      tick_seconds: 60,
      global_seed: 'seed-default'
    };
  }
}

function emit() {
  for (const cb of subscribers) {
    try {
      cb(stateRef);
    } catch (_error) {
      // subscriber errors are isolated
    }
  }
}

export const Game = {
  async init() {
    const nowUnixTs = Math.floor(Date.now() / 1000);
    const rules = await loadRules();
    storage = createStorage({ throttleMs: 1500 });

    const loaded = storage.loadState();
    const recovered = recoverOrInitState({
      candidateState: loaded.state,
      tickSeconds: rules.tick_seconds,
      globalSeed: rules.global_seed,
      nowUnixTs: Date.now()
    });

    stateRef = recovered.state;

    if (stateRef.tick_seconds !== rules.tick_seconds) {
      stateRef.tick_seconds = rules.tick_seconds;
    }

    if (!stateRef.global_seed) {
      stateRef.global_seed = rules.global_seed;
    }

    processOfflineTicks({
      state: stateRef,
      nowUnixTs,
      chunkSize: 300
    });

    stateRef.last_persisted_tick_index = stateRef.tick_index;
    storage.persistNow(stateRef);
    emit();

    return stateRef;
  },

  getState() {
    return stateRef;
  },

  onStateChange(cb) {
    if (typeof cb !== 'function') {
      return () => {};
    }

    subscribers.add(cb);
    return () => subscribers.delete(cb);
  }
};
