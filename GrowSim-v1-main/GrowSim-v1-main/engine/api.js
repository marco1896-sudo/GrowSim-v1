import { recoverOrInitState } from './state.js';
import { processOfflineTicks } from './clock.js';
import { createStorage } from './storage.js';
import { loadGameData } from './data.js';
import { processEventTick } from './events.js';

const subscribers = new Set();
let stateRef = null;
let storage = null;
let dataRef = null;

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
    dataRef = await loadGameData();
    storage = createStorage({ throttleMs: 1500 });

    const loaded = storage.loadState();
    const recovered = recoverOrInitState({
      candidateState: loaded.state,
      tickSeconds: dataRef.rules.tick_seconds,
      globalSeed: dataRef.rules.global_seed,
      nowUnixTs: Date.now()
    });

    stateRef = recovered.state;

    if (stateRef.tick_seconds !== dataRef.rules.tick_seconds) {
      stateRef.tick_seconds = dataRef.rules.tick_seconds;
    }

    if (!stateRef.global_seed) {
      stateRef.global_seed = dataRef.rules.global_seed;
    }

    processOfflineTicks({
      state: stateRef,
      nowUnixTs,
      chunkSize: 300,
      onTickBatch(chunkTicks, chunkStartTick) {
        for (let i = 1; i <= chunkTicks; i += 1) {
          const tickIndex = chunkStartTick + i;
          processEventTick({
            state: stateRef,
            eventCatalog: dataRef.events,
            rules: dataRef.rules,
            tickIndex
          });
        }
      }
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
