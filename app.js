/*
ASSUMPTIONS:
- This Phase-1 implementation follows docs/PLAN.md architecture with one nested state object and one central tick loop.
- Runtime mode defaults to "dev" for faster verification and can be switched via CONFIG.MODE.
- /api/push/subscribe and /api/push/schedule are backend stubs; failures are logged but never break the app.
*/

'use strict';

const CONFIG = Object.freeze({
  MODE: 'prod',
  timing: Object.freeze({
    uiTickMs: 1000,
    eventRollMinRealMs: 30 * 60 * 1000,
    eventRollMaxRealMs: 90 * 60 * 1000,
    eventCooldownMs: 20 * 60 * 1000
  }),
  simulation: Object.freeze({
    timeCompression: 12,
    dayStartHour: 6,
    nightStartHour: 22,
    startHour: 8,
    globalSeed: 'grow-sim-v1-seed',
    plantId: 'plant-001'
  }),
  boostAdvanceMs: 30 * 60 * 1000,
  maxHistoryLog: 200,
  persistThrottleMs: 2500,
  logTickEveryNTicks: 10,
  actionDebounceMs: 450
});

const MODE = CONFIG.MODE === 'dev' ? 'dev' : 'prod';
const UI_TICK_INTERVAL_MS = CONFIG.timing.uiTickMs;
const EVENT_ROLL_MIN_REAL_MS = CONFIG.timing.eventRollMinRealMs;
const EVENT_ROLL_MAX_REAL_MS = CONFIG.timing.eventRollMaxRealMs;
const EVENT_COOLDOWN_MS = CONFIG.timing.eventCooldownMs;
const BOOST_ADVANCE_MS = CONFIG.boostAdvanceMs;
const SIM_TIME_COMPRESSION = CONFIG.simulation.timeCompression;
const SIM_DAY_START_HOUR = CONFIG.simulation.dayStartHour;
const SIM_NIGHT_START_HOUR = CONFIG.simulation.nightStartHour;
const SIM_START_HOUR = CONFIG.simulation.startHour;
const SIM_GLOBAL_SEED = CONFIG.simulation.globalSeed;
const SIM_PLANT_ID = CONFIG.simulation.plantId;
const MAX_HISTORY_LOG = CONFIG.maxHistoryLog;
const PERSIST_THROTTLE_MS = CONFIG.persistThrottleMs;
const MAX_ELAPSED_PER_TICK_MS = 5000;
const APP_BASE_PATH = resolveAppBasePath();
const FREEZE_SIM_ON_DEATH = true; // Für Klarheit: Simulation pausiert nach Tod der Pflanze.

const DB_NAME = 'grow-sim-db';
const DB_STORE = 'kv';
const DB_KEY = 'state-v2';
const LS_STATE_KEY = 'grow-sim-state-v2';
const PUSH_SUB_KEY = 'grow-sim-push-sub-v1';
const EVENTS_CATALOG_VERSION = '20260301-de';
const ACTIONS_CATALOG_VERSION = '20260304-v1';
const VAPID_PUBLIC_KEY = 'BElxPLACEHOLDERp8v2C4CwY6ofqP5E8v2rFjQvqW8g4bW2-v8JvKc-l7dXXn4N1xqjY7PqFhL3O8m4jzWzI8v7jA';

const REAL_RUN_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const TOTAL_LIFECYCLE_SIM_DAYS = 88;
const SIM_DAY_MS = 24 * 60 * 60 * 1000;
const TOTAL_LIFECYCLE_SIM_MS = TOTAL_LIFECYCLE_SIM_DAYS * SIM_DAY_MS;

const STAGE_DEFS = Object.freeze([
  Object.freeze({ index: 0, id: 'germination', label: 'Keimung', simDayStart: 0, phase: 'seedling', minHealth: 30, maxStress: 85 }),
  Object.freeze({ index: 1, id: 'seedling', label: 'Keimling', simDayStart: 3, phase: 'seedling', minHealth: 35, maxStress: 80 }),
  Object.freeze({ index: 2, id: 'early_vegetative', label: 'Frühe Vegetationsphase', simDayStart: 8, phase: 'vegetative', minHealth: 40, maxStress: 75 }),
  Object.freeze({ index: 3, id: 'vegetative', label: 'Vegetationsphase', simDayStart: 16, phase: 'vegetative', minHealth: 42, maxStress: 72 }),
  Object.freeze({ index: 4, id: 'late_vegetative', label: 'Späte Vegetationsphase', simDayStart: 24, phase: 'vegetative', minHealth: 45, maxStress: 70 }),
  Object.freeze({ index: 5, id: 'pre_flower', label: 'Vorblüte', simDayStart: 31, phase: 'vegetative', minHealth: 48, maxStress: 65 }),
  Object.freeze({ index: 6, id: 'stretch', label: 'Streckphase', simDayStart: 39, phase: 'flowering', minHealth: 50, maxStress: 60 }),
  Object.freeze({ index: 7, id: 'early_flower', label: 'Frühe Blüte', simDayStart: 47, phase: 'flowering', minHealth: 52, maxStress: 58 }),
  Object.freeze({ index: 8, id: 'flower', label: 'Blüte', simDayStart: 57, phase: 'flowering', minHealth: 54, maxStress: 55 }),
  Object.freeze({ index: 9, id: 'late_flower', label: 'Späte Blüte', simDayStart: 66, phase: 'flowering', minHealth: 55, maxStress: 52 }),
  Object.freeze({ index: 10, id: 'ripening', label: 'Reife', simDayStart: 75, phase: 'harvest', minHealth: 56, maxStress: 50 }),
  Object.freeze({ index: 11, id: 'harvest_ready', label: 'Erntereif', simDayStart: 84, phase: 'harvest', minHealth: 0, maxStress: 100 })
]);

const DEFAULT_STAGE_TIMELINE = Object.freeze([
  Object.freeze({ id: 'germination_seedling', label: 'Keimung / Sämling', phase: 'seedling', simDayStart: 0 }),
  Object.freeze({ id: 'early_vegetative', label: 'Frühe Vegetation', phase: 'vegetative', simDayStart: 4 }),
  Object.freeze({ id: 'mid_vegetative', label: 'Mittlere Vegetation', phase: 'vegetative', simDayStart: 14 }),
  Object.freeze({ id: 'late_vegetative_preflower', label: 'Späte Vegetation / Vorblüte', phase: 'vegetative', simDayStart: 28 }),
  Object.freeze({ id: 'early_flower', label: 'Frühe Blüte', phase: 'flowering', simDayStart: 38 }),
  Object.freeze({ id: 'mid_flower', label: 'Mittlere Blüte', phase: 'flowering', simDayStart: 52 }),
  Object.freeze({ id: 'late_flower_ripe', label: 'Späte Blüte / Reife', phase: 'flowering', simDayStart: 68 }),
  Object.freeze({ id: 'finish', label: 'Reife / Finish', phase: 'harvest', simDayStart: 82 })
]);

const STAGE_ASSET_FALLBACK = Object.freeze({
  stage_01: 'seedling_01.png',
  stage_02: 'seedling_02.png',
  stage_03: 'veg_01.png',
  stage_04: 'veg_02.png',
  stage_05: 'veg_03.png',
  stage_06: 'veg_04.png',
  stage_07: 'flower_01.png',
  stage_08: 'flower_02.png',
  stage_09: 'flower_03.png',
  stage_10: 'flower_04.png',
  stage_11: 'flower_05.png',
  stage_12: 'harverst.png'
});

const PHASE_LABEL_DE = Object.freeze({
  seedling: 'Keimling',
  vegetative: 'Vegetativ',
  flowering: 'Blüte',
  harvest: 'Ernte',
  dead: 'Tot'
});

const OVERLAY_ASSETS = Object.freeze({
  overlay_burn: '/assets/overlays/overlay_burn.png',
  overlay_def_mg: '/assets/overlays/overlay_def_mg.png',
  overlay_def_n: '/assets/overlays/overlay_def_n.png',
  overlay_mold_warning: '/assets/overlays/overlay_mold_warning.png',
  overlay_pest_mites: '/assets/overlays/overlay_pest_mites.png',
  overlay_pest_thrips: '/assets/overlays/overlay_pest_thrips.png'
});

const now = Date.now();
const initialSimTimeMs = alignToSimStartHour(now, SIM_START_HOUR);
const state = {
  schemaVersion: '1.0.0',
  seed: SIM_GLOBAL_SEED,
  plantId: SIM_PLANT_ID,
  setup: null,
  settings: {
    notifications: {
      enabled: false,
      types: {
        events: true,
        critical: true,
        reminder: true
      },
      runtime: {
        lastNotifiedEventId: null,
        lastCriticalAtRealMs: 0,
        lastReminderAtRealMs: 0
      }
    },
    pushNotificationsEnabled: false
  },
  meta: {
    rescue: {
      used: false,
      usedAtRealMs: null,
      lastResult: null
    }
  },
  simulation: {
    nowMs: now,
    startRealTimeMs: now,
    lastTickRealTimeMs: now,
    simTimeMs: initialSimTimeMs,
    simEpochMs: initialSimTimeMs,
    simDay: 0,
    simHour: SIM_START_HOUR,
    simMinute: 0,
    tickCount: 0,
    mode: MODE,
    tickIntervalMs: UI_TICK_INTERVAL_MS,
    timeCompression: SIM_TIME_COMPRESSION,
    globalSeed: SIM_GLOBAL_SEED,
    plantId: SIM_PLANT_ID,
    dayWindow: { startHour: SIM_DAY_START_HOUR, endHour: SIM_NIGHT_START_HOUR },
    isDaytime: isDaytimeAtSimTime(initialSimTimeMs),
    growthImpulse: 0,
    lastPushScheduleAtMs: 0
  },
  plant: {
    phase: 'seedling',
    isDead: false,
    stageIndex: 0,
    stageKey: 'stage_01',
    stageProgress: 0,
    stageStartSimDay: 0,
    lastValidStageKey: 'stage_01',
    averageHealth: 85,
    averageStress: 15,
    observedSimMs: 0,
    lifecycle: {
      totalSimDays: TOTAL_LIFECYCLE_SIM_DAYS,
      qualityTier: 'normal',
      qualityScore: 77.5,
      qualityLocked: false
    },
    assets: {
      basePath: 'assets/plant/',
      resolvedStagePath: ''
    }
  },
  events: {
    machineState: 'idle',
    scheduler: {
      nextEventRealTimeMs: now + EVENT_ROLL_MIN_REAL_MS,
      lastEventRealTimeMs: 0,
      lastEventId: null,
      lastChoiceId: null,
      lastEventCategory: null,
      deferredUntilDaytime: false,
      windowRealMinutes: { min: 30, max: 90 },
      eventCooldowns: {},
      categoryCooldowns: {}
    },
    active: null,
    history: [],
    activeEventId: null,
    activeEventTitle: '',
    activeEventText: '',
    activeLearningNote: '',
    activeOptions: [],
    activeSeverity: 1,
    activeCooldownRealMinutes: 120,
    activeCategory: 'generic',
    activeTags: [],
    lastEventAtMs: 0,
    cooldownUntilMs: 0,
    catalog: []
  },
  history: { actions: [], events: [], system: [], systemLog: [] },
  debug: { enabled: false, showInternalTicks: false, forceDaytime: false },
  status: {
    health: 85,
    stress: 15,
    water: 70,
    nutrition: 65,
    growth: 0,
    risk: 20
  },
  boost: {
    boostUsedToday: 0,
    boostMaxPerDay: 6,
    dayStamp: dayStamp(now)
  },
  actions: {
    catalog: [],
    byId: {},
    cooldowns: {},
    activeEffects: []
  },
  ui: {
    openSheet: null,
    menuOpen: false,
    menuDialogOpen: false,
    selectedBackground: 'bg_dark_01.jpg',
    visibleOverlayIds: [],
    deathOverlayOpen: false,
    deathOverlayAcknowledged: false,
    care: {
      selectedCategory: null,
      feedback: { kind: 'info', text: 'Bereit.' }
    },
    analysis: {
      activeTab: 'overview'
    }
  },
  lastEventId: null,
  lastChoiceId: null,
  historyLog: []
};

const ui = {};
const warnedUiKeys = new Set();
let storageAdapter = null;
let tickHandle = null;
let loopRunning = false;
let visibilityHandlerBound = false;
let heartbeatWatchdogHandle = null;
let persistTimer = null;
let rescueAdPending = false;
let wasCriticalHealth = false;
let menuDialogConfirmHandler = null;

const actionDebounceUntil = Object.create(null);

window.__gsBootOk = false;

document.addEventListener('DOMContentLoaded', () => {
  boot().catch((error) => {
    console.error('Boot promise failed', error);
    showBootError(error);
  });
});

async function boot() {
  try {
    cacheUi();
    if (!ensureRequiredUi()) {
      throw new Error('Required UI elements missing');
    }

    storageAdapter = await createStorageAdapter();
    await initOrMigrateState();
    await loadCatalogs();

    bindUi();
    applyBackgroundAsset();
    await registerServiceWorker();

    const bootNowMs = Date.now();
    syncSimulationFromElapsedTime(bootNowMs);
    syncRuntimeClocks(bootNowMs);
    syncActiveEventFromCatalog();
    updateVisibleOverlays();
    syncCanonicalStateShape();

    addLog('system', 'Runtime initialisiert', {
      mode: state.simulation.mode,
      events: state.events.catalog.length,
      actions: state.actions.catalog.length
    });

    window.__applyAction = (id) => applyAction(id);
    window.__devSelfTest = () => runDevSelfTest();

    startLoopOnce();
    startHeartbeatWatchdog();
    renderAll();
    renderLanding();
    window.__gsBootOk = true;
    state.ui.lastRenderRealMs = Date.now();

    await schedulePushIfAllowed(true);
    await persistState();
  } catch (error) {
    console.error('Boot failed', error);
    showBootError(error);
  }
}

async function initOrMigrateState() {
  await restoreState();
  migrateState();
  ensureStateIntegrity(Date.now());
}

async function loadCatalogs() {
  await loadEventCatalog();
  await loadActionsCatalog();
}

function startLoopOnce() {
  if (loopRunning || tickHandle !== null) {
    return;
  }
  loopRunning = true;
  tickHandle = setInterval(tick, state.simulation.tickIntervalMs);
}

function stopLoop() {
  if (tickHandle !== null) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
  loopRunning = false;
}

function startHeartbeatWatchdog() {
  if (heartbeatWatchdogHandle !== null) {
    return;
  }
  heartbeatWatchdogHandle = setInterval(() => {
    if (document.visibilityState !== 'visible') {
      return;
    }
    const last = Number(state.ui && state.ui.lastRenderRealMs) || 0;
    if (!loopRunning || !Number.isFinite(last) || (Date.now() - last) > 15000) {
      showRuntimeHaltBanner();
    }
  }, 3000);
}

function runDevSelfTest() {
  if (!state.debug || !state.debug.enabled) {
    return { ok: false, reason: 'debug_disabled' };
  }

  const assertions = [];
  const beforeSim = getCanonicalSimulation(state).simTimeMs;

  tick();
  const afterTickSim = getCanonicalSimulation(state).simTimeMs;
  assertions.push({ name: 'tick_advances_sim_time', pass: afterTickSim > beforeSim });

  const actionResult = applyAction('watering_low_mist');
  assertions.push({ name: 'apply_action_path', pass: Boolean(actionResult && (actionResult.ok || actionResult.reason)) });

  activateEvent(Date.now());
  const active = getCanonicalEvents(state);
  if (active.machineState === 'activeEvent' && Array.isArray(active.activeOptions) && active.activeOptions.length) {
    onEventOptionClick(active.activeOptions[0].id);
  }

  const canonical = {
    simulation: Boolean(state.simulation && state.simulation),
    plant: Boolean(state.plant && state.plant),
    events: Boolean(state.events && state.events.scheduler && state.events),
    history: Boolean(state.history && Array.isArray(state.history.actions) && Array.isArray(state.history.events))
  };

  assertions.push({ name: 'canonical_shapes_present', pass: Object.values(canonical).every(Boolean) });

  return {
    ok: assertions.every((item) => item.pass),
    assertions,
    canonical
  };
}

function addLog(type, message, details) {
  const timestamp = Date.now();
  const payload = details || null;
  const entry = {
    id: `${timestamp}-${state.simulation.tickCount}-${state.history.systemLog.length}`,
    atMs: timestamp,
    t: timestamp,
    type,
    message,
    msg: message,
    details: payload,
    data: payload
  };

  state.history.systemLog.push(entry);
  if (state.history.systemLog.length > MAX_HISTORY_LOG) {
    state.history.systemLog = state.history.systemLog.slice(-MAX_HISTORY_LOG);
  }

  if (!state.history || typeof state.history !== 'object') {
    state.history = { actions: [], events: [], system: [] };
  }

  if (type === 'action') {
    state.history.actions = Array.isArray(state.history.actions) ? state.history.actions : [];
    state.history.actions.push({
      type: 'action',
      id: (payload && payload.id) || message,
      category: payload && payload.category,
      intensity: payload && payload.intensity,
      label: payload && payload.label,
      atSimTimeMs: state.simulation.simTimeMs,
      atRealTimeMs: timestamp,
      result: 'ok',
      reason: payload && payload.reason,
      deltaSummary: payload && payload.deltaSummary ? payload.deltaSummary : {},
      sideEffects: payload && payload.sideEffects ? payload.sideEffects : []
    });
  } else if (type === 'event' || type === 'event_shown' || type === 'choice') {
    state.history.events = Array.isArray(state.history.events) ? state.history.events : [];
  } else {
    state.history.system = Array.isArray(state.history.system) ? state.history.system : [];
    state.history.system.push({
      type: 'system',
      id: type,
      atSimTimeMs: state.simulation.simTimeMs,
      details: payload || { message }
    });
  }
}

function requestRescueAd() {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve({ ok: true });
    }, 1200);
  });
}

function applyRescueEffects() {
  const before = {
    health: Number(state.status.health) || 0,
    stress: Number(state.status.stress) || 0,
    risk: Number(state.status.risk) || 0,
    growth: Number(state.status.growth) || 0,
    water: Number(state.status.water) || 0,
    nutrition: Number(state.status.nutrition) || 0,
    qualityScore: Number(state.plant?.lifecycle?.qualityScore) || 0
  };
  const wasDead = isPlantDead();
  const isCriticalAlive = !wasDead && before.health < 20;
  if (!wasDead && !isCriticalAlive) {
    return { ok: false };
  }

  if (wasDead) {
    state.status.health = 34;
    state.status.stress = before.stress - 22;
    state.status.risk = before.risk - 18;
    state.status.water = Math.max(before.water, 40);
    state.status.nutrition = Math.max(before.nutrition, 32);
    state.status.growth = Math.max(4, before.growth - 2);
    if (state.plant && state.plant.lifecycle && Number.isFinite(before.qualityScore)) {
      state.plant.lifecycle.qualityScore = round2(Math.max(0, before.qualityScore - 6));
    }
    state.plant.isDead = false;
    if (state.plant.phase === 'dead') {
      const safeIndex = clampInt(Number(state.plant.stageIndex) || 0, 0, Math.max(0, getStageTimeline().length - 1));
      state.plant.phase = getStageTimeline()[safeIndex]?.phase || 'seedling';
    }
    state.ui.deathOverlayOpen = false;
    state.ui.deathOverlayAcknowledged = true;
  } else {
    state.status.health = before.health + 15;
    state.status.stress = before.stress - 10;
    state.status.risk = before.risk - 10;
  }

  clampStatus();

  const after = {
    health: Number(state.status.health) || 0,
    stress: Number(state.status.stress) || 0,
    risk: Number(state.status.risk) || 0,
    growth: Number(state.status.growth) || 0,
    water: Number(state.status.water) || 0,
    nutrition: Number(state.status.nutrition) || 0,
    qualityScore: Number(state.plant?.lifecycle?.qualityScore) || 0
  };

  return {
    ok: true,
    wasDead,
    effectsApplied: {
      health: round2(after.health - before.health),
      stress: round2(after.stress - before.stress),
      risk: round2(after.risk - before.risk),
      growth: round2(after.growth - before.growth),
      water: round2(after.water - before.water),
      nutrition: round2(after.nutrition - before.nutrition),
      qualityScore: round2(after.qualityScore - before.qualityScore)
    }
  };
}

function resolveAppBasePath() {
  const path = window.location.pathname || '/';
  if (path === '/' || path.endsWith('/index.html')) {
    const base = path.replace(/\/index\.html$/, '').replace(/\/$/, '');
    return base;
  }
  return path.replace(/\/$/, '');
}

function appPath(relativePath) {
  const normalized = String(relativePath || '').replace(/^\//, '');
  return `./${normalized}`;
}
