export const STATE_VERSION = 1;

function defaultPlant(plantId, currentTick) {
  return {
    plant_id: String(plantId),
    created_tick: currentTick,
    alive: true,
    growth_stage: 0,
    growth_points: 0,
    health: 100,
    water: 70,
    nutrition: 70,
    stress: 0,
    environment_light: 0,
    environment_temp: 0,
    vigor: 1,
    last_tick_growth_delta: 0,
    active_events: [],
    cooldowns: {},
    plant_tick_index: 0,
    last_processed_global_tick: currentTick
  };
}

export function createInitialState({ tickSeconds = 60, globalSeed = 'seed-default', nowUnixTs = Date.now() } = {}) {
  const nowSec = Math.floor(nowUnixTs / 1000);
  return {
    state_version: STATE_VERSION,
    global_seed: globalSeed,
    tick_seconds: tickSeconds,
    tick_index: 0,
    last_persisted_tick_index: 0,
    difficulty_days_since_start: 0,
    difficulty_scalar_D: 0,
    offline_backlog_ticks: 0,
    sim_start_unix_ts: nowSec,
    last_wallclock_unix_ts: nowSec,
    plants: {
      plant_001: defaultPlant('plant_001', 0)
    }
  };
}

export function migrateState(rawState) {
  if (!rawState || typeof rawState !== 'object') {
    return null;
  }

  // Migration stub for future versions.
  // For now, only version 1 is supported.
  if (rawState.state_version === STATE_VERSION) {
    return rawState;
  }

  return null;
}

export function validateState(state) {
  if (!state || typeof state !== 'object') return false;
  if (state.state_version !== STATE_VERSION) return false;
  if (!Number.isInteger(state.tick_seconds) || state.tick_seconds <= 0) return false;
  if (!Number.isInteger(state.tick_index) || state.tick_index < 0) return false;
  if (!state.plants || typeof state.plants !== 'object') return false;

  const plantIds = Object.keys(state.plants).sort();
  for (const plantId of plantIds) {
    const plant = state.plants[plantId];
    if (!plant || typeof plant !== 'object') return false;
    if (plant.plant_id !== plantId) return false;
    if (!Array.isArray(plant.active_events)) return false;
    if (!plant.cooldowns || typeof plant.cooldowns !== 'object') return false;
  }

  return true;
}

export function recoverOrInitState({ candidateState, tickSeconds, globalSeed, nowUnixTs, corruptionFallback = 'reinit' } = {}) {
  const migrated = migrateState(candidateState);
  if (migrated && validateState(migrated)) {
    return { state: migrated, recovered: true, corrupted: false };
  }

  if (corruptionFallback === 'throw') {
    throw new Error('State is corrupted or unsupported and cannot be recovered.');
  }

  return {
    state: createInitialState({ tickSeconds, globalSeed, nowUnixTs }),
    recovered: false,
    corrupted: Boolean(candidateState)
  };
}
