import { recoverOrInitState } from './state.js';
import { processOfflineTicks } from './clock.js';
import { createStorage } from './storage.js';
import { loadGameData } from './data.js';
import { runSimulationTick } from './simulation.js';

const subscribers = new Set();
let stateRef = null;
let storage = null;
let dataRef = null;
let liveTimer = null;

function emit() {
  for (const cb of subscribers) {
    try {
      cb(stateRef);
    } catch (_error) {
      // subscriber errors are isolated
    }
  }
}

function runOneTick() {
  stateRef.tick_index += 1;
  runSimulationTick({
    state: stateRef,
    data: dataRef,
    tickIndex: stateRef.tick_index
  });
  stateRef.last_wallclock_unix_ts = Math.floor(Date.now() / 1000);
  storage.saveThrottled(stateRef);
  emit();
}

function startLiveLoop() {
  if (liveTimer !== null) {
    clearInterval(liveTimer);
  }

  const ms = Math.max(250, stateRef.tick_seconds * 1000);
  liveTimer = setInterval(runOneTick, ms);
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
          runSimulationTick({
            state: stateRef,
            data: dataRef,
            tickIndex
          });
        }
      }
    });

    stateRef.last_persisted_tick_index = stateRef.tick_index;
    storage.persistNow(stateRef);
    emit();
    startLiveLoop();

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
