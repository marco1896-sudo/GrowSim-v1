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
const MAX_ELAPSED_PER_TICK_MS = 5 * 60 * 1000;
const APP_BASE_PATH = resolveAppBasePath();

const DB_NAME = 'grow-sim-db';
const DB_STORE = 'kv';
const DB_KEY = 'state-v2';
const LS_STATE_KEY = 'grow-sim-state-v2';
const PUSH_SUB_KEY = 'grow-sim-push-sub-v1';
const EVENTS_CATALOG_VERSION = '20260301-de';
const ACTIONS_CATALOG_VERSION = '20260304-v1';
const VAPID_PUBLIC_KEY = 'BElxPLACEHOLDERp8v2C4CwY6ofqP5E8v2rFjQvqW8g4bW2-v8JvKc-l7dXXn4N1xqjY7PqFhL3O8m4jzWzI8v7jA';

const TOTAL_LIFECYCLE_SIM_DAYS = 56;
const SIM_DAY_MS = 24 * 60 * 60 * 1000;

const STAGE_DEFS = Object.freeze([
  Object.freeze({ index: 0, id: 'germination', label: 'Germination', simDayStart: 0, phase: 'seedling', minHealth: 30, maxStress: 85 }),
  Object.freeze({ index: 1, id: 'seedling', label: 'Seedling', simDayStart: 2, phase: 'seedling', minHealth: 35, maxStress: 80 }),
  Object.freeze({ index: 2, id: 'early_vegetative', label: 'Early Vegetative', simDayStart: 5, phase: 'vegetative', minHealth: 40, maxStress: 75 }),
  Object.freeze({ index: 3, id: 'vegetative', label: 'Vegetative', simDayStart: 10, phase: 'vegetative', minHealth: 42, maxStress: 72 }),
  Object.freeze({ index: 4, id: 'late_vegetative', label: 'Late Vegetative', simDayStart: 15, phase: 'vegetative', minHealth: 45, maxStress: 70 }),
  Object.freeze({ index: 5, id: 'pre_flower', label: 'Pre-flower', simDayStart: 20, phase: 'vegetative', minHealth: 48, maxStress: 65 }),
  Object.freeze({ index: 6, id: 'stretch', label: 'Stretch', simDayStart: 25, phase: 'flowering', minHealth: 50, maxStress: 60 }),
  Object.freeze({ index: 7, id: 'early_flower', label: 'Early Flower', simDayStart: 30, phase: 'flowering', minHealth: 52, maxStress: 58 }),
  Object.freeze({ index: 8, id: 'flower', label: 'Flower', simDayStart: 36, phase: 'flowering', minHealth: 54, maxStress: 55 }),
  Object.freeze({ index: 9, id: 'late_flower', label: 'Late Flower', simDayStart: 42, phase: 'flowering', minHealth: 55, maxStress: 52 }),
  Object.freeze({ index: 10, id: 'ripening', label: 'Ripening', simDayStart: 48, phase: 'harvest', minHealth: 56, maxStress: 50 }),
  Object.freeze({ index: 11, id: 'harvest_ready', label: 'Harvest Ready', simDayStart: 54, phase: 'harvest', minHealth: 0, maxStress: 100 })
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
  flowering: 'Bluete',
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
  simulation: {},
  plant: {},
  events: {
    scheduler: {
      nextEventRealTimeMs: now + EVENT_ROLL_MIN_REAL_MS,
      lastEventRealTimeMs: 0,
      lastEventId: null,
      lastEventCategory: null,
      deferredUntilDaytime: false,
      windowRealMinutes: { min: 30, max: 90 },
      eventCooldowns: {}
    },
    active: null,
    history: []
  },
  history: { actions: [], events: [], system: [] },
  debug: { enabled: false, showInternalTicks: false, forceDaytime: false },
  sim: {
    nowMs: now,
    simTimeMs: initialSimTimeMs,
    simEpochMs: initialSimTimeMs,
    tickCount: 0,
    mode: MODE,
    tickIntervalMs: UI_TICK_INTERVAL_MS,
    timeCompression: SIM_TIME_COMPRESSION,
    globalSeed: SIM_GLOBAL_SEED,
    plantId: SIM_PLANT_ID,
    isDaytime: isDaytimeAtSimTime(initialSimTimeMs),
    lastTickAtMs: now,
    growthImpulse: 0,
    lastPushScheduleAtMs: 0
  },
  growth: {
    phase: 'seedling',
    stageIndex: 0,
    stageName: 'stage_01',
    stageProgress: 0,
    lastValidStageName: 'stage_01',
    averageHealth: 85,
    averageStress: 15,
    observedSimMs: 0,
    qualityTier: 'normal',
    qualityLocked: false
  },
  status: {
    health: 85,
    stress: 15,
    water: 70,
    nutrition: 65,
    growth: 10,
    risk: 20
  },
  boost: {
    boostUsedToday: 0,
    boostMaxPerDay: 6,
    dayStamp: dayStamp(now)
  },
  event: {
    machineState: 'idle',
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
    nextEventAtMs: now + EVENT_ROLL_MIN_REAL_MS,
    cooldownUntilMs: 0,
    lastChoiceId: null,
    catalog: []
  },
  actions: {
    catalog: [],
    byId: {},
    cooldowns: {},
    activeEffects: []
  },
  ui: {
    openSheet: null,
    selectedBackground: 'bg_dark_01.jpg',
    visibleOverlayIds: [],
    care: {
      selectedCategory: null,
      feedback: { kind: 'info', text: 'Bereit.' }
    }
  },
  lastEventId: null,
  lastChoiceId: null,
  historyLog: []
};

const ui = {};
let storageAdapter = null;
let tickHandle = null;
let persistTimer = null;
let logRenderSignature = '';
const actionDebounceUntil = Object.create(null);

document.addEventListener('DOMContentLoaded', boot);

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

    syncRuntimeClocks(Date.now());
    syncActiveEventFromCatalog();
    updateVisibleOverlays();
    syncCanonicalStateShape();

    addLog('system', 'Runtime initialisiert', {
      mode: state.sim.mode,
      events: state.event.catalog.length,
      actions: state.actions.catalog.length
    });

    window.__applyAction = (id) => applyAction(id);

    startLoopOnce();
    renderAll();
    renderLanding();

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
  if (tickHandle !== null) {
    return;
  }
  tickHandle = setInterval(tick, state.sim.tickIntervalMs);
}

function showBootError(error) {
  const banner = document.createElement('div');
  banner.style.position = 'fixed';
  banner.style.inset = '0 auto auto 0';
  banner.style.zIndex = '9999';
  banner.style.background = '#701a1a';
  banner.style.color = '#fff';
  banner.style.padding = '8px 10px';
  banner.style.fontSize = '12px';
  banner.textContent = `Boot error: ${error.message}`;
  document.body.appendChild(banner);
}

function cacheUi() {
  ui.statusPill = document.getElementById('statusPill');
  ui.healthRing = document.getElementById('healthRing');
  ui.stressRing = document.getElementById('stressRing');
  ui.waterRing = document.getElementById('waterRing');
  ui.nutritionRing = document.getElementById('nutritionRing');
  ui.growthRing = document.getElementById('growthRing');
  ui.riskRing = document.getElementById('riskRing');

  ui.healthValue = document.getElementById('healthValue');
  ui.stressValue = document.getElementById('stressValue');
  ui.waterValue = document.getElementById('waterValue');
  ui.nutritionValue = document.getElementById('nutritionValue');
  ui.growthValue = document.getElementById('growthValue');
  ui.riskValue = document.getElementById('riskValue');

  ui.plantImage = document.getElementById('plantImage');
  ui.nextEventValue = document.getElementById('nextEventValue');
  ui.growthImpulseValue = document.getElementById('growthImpulseValue');
  ui.simTimeValue = document.getElementById('simTimeValue');
  ui.boostUsageText = document.getElementById('boostUsageText');

  ui.overlayBurn = document.getElementById('overlayBurn');
  ui.overlayDefMg = document.getElementById('overlayDefMg');
  ui.overlayDefN = document.getElementById('overlayDefN');
  ui.overlayMoldWarning = document.getElementById('overlayMoldWarning');
  ui.overlayPestMites = document.getElementById('overlayPestMites');
  ui.overlayPestThrips = document.getElementById('overlayPestThrips');

  ui.careActionBtn = document.getElementById('careActionBtn');
  ui.analyzeActionBtn = document.getElementById('analyzeActionBtn');
  ui.boostActionBtn = document.getElementById('boostActionBtn');
  ui.openDiagnosisBtn = document.getElementById('openDiagnosisBtn');

  ui.backdrop = document.getElementById('sheetBackdrop');
  ui.careSheet = document.getElementById('careSheet');
  ui.eventSheet = document.getElementById('eventSheet');
  ui.dashboardSheet = document.getElementById('dashboardSheet');
  ui.diagnosisSheet = document.getElementById('diagnosisSheet');

  ui.careCategoryList = document.getElementById('careCategoryList');
  ui.careActionList = document.getElementById('careActionList');
  ui.careFeedback = document.getElementById('careFeedback');
  ui.eventStateBadge = document.getElementById('eventStateBadge');
  ui.eventTitle = document.getElementById('eventTitle');
  ui.eventText = document.getElementById('eventText');
  ui.eventMeta = document.getElementById('eventMeta');
  ui.eventOptionList = document.getElementById('eventOptionList');
  ui.pushSubscribeBtn = document.getElementById('pushSubscribeBtn');
  ui.clearLogBtn = document.getElementById('clearLogBtn');
  ui.lastEventValue = document.getElementById('lastEventValue');
  ui.lastChoiceValue = document.getElementById('lastChoiceValue');
  ui.logList = document.getElementById('logList');

  ui.landing = document.getElementById('landing');
  ui.startRunBtn = document.getElementById('startRunBtn');
  ui.setupMode = document.getElementById('setupMode');
  ui.setupLight = document.getElementById('setupLight');
  ui.setupMedium = document.getElementById('setupMedium');
  ui.setupPotSize = document.getElementById('setupPotSize');
  ui.setupGenetics = document.getElementById('setupGenetics');
}

function bindUi() {
  ui.careActionBtn.addEventListener('click', () => withDebouncedAction('care', ui.careActionBtn, () => openSheet('care')));
  ui.analyzeActionBtn.addEventListener('click', () => withDebouncedAction('analyze', ui.analyzeActionBtn, () => openSheet('dashboard')));
  ui.boostActionBtn.addEventListener('click', () => withDebouncedAction('boost', ui.boostActionBtn, onBoostAction));
  ui.openDiagnosisBtn.addEventListener('click', () => openSheet('diagnosis'));
  ui.pushSubscribeBtn.addEventListener('click', () => withDebouncedAction('push_subscribe', ui.pushSubscribeBtn, onPushSubscribe));
  ui.clearLogBtn.addEventListener('click', () => withDebouncedAction('clear_log', ui.clearLogBtn, onClearLog));
  ui.startRunBtn.addEventListener('click', onStartRun);
  ui.backdrop.addEventListener('click', closeSheet);

  const closeButtons = document.querySelectorAll('[data-close-sheet]');
  for (const button of closeButtons) {
    button.addEventListener('click', closeSheet);
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
}

function tick() {
  const nowMs = Date.now();
  const elapsedRealMs = clamp(nowMs - state.sim.lastTickAtMs, 0, MAX_ELAPSED_PER_TICK_MS);
  const elapsedSimMs = elapsedRealMs * state.sim.timeCompression;
  const prevOpenSheet = state.ui.openSheet;

  state.sim.nowMs = nowMs;
  state.sim.simTimeMs += elapsedSimMs;
  state.sim.isDaytime = isDaytimeAtSimTime(state.sim.simTimeMs);
  state.sim.lastTickAtMs = nowMs;
  state.sim.tickCount += 1;

  applyStatusDrift(elapsedRealMs);
  applyActiveActionEffects(elapsedSimMs);
  advanceGrowthTick(elapsedSimMs);
  runEventStateMachine(nowMs);
  resetBoostDaily(nowMs);
  updateVisibleOverlays();
  syncCanonicalStateShape();


  if (state.ui.openSheet !== prevOpenSheet) {
    renderSheets();
  }

  renderHud();
  renderEventSheet();
  renderLogList();
  schedulePersistState();
}

function ensureRequiredUi() {
  const requiredKeys = [
    'statusPill', 'healthRing', 'stressRing', 'waterRing', 'nutritionRing', 'growthRing', 'riskRing',
    'healthValue', 'stressValue', 'waterValue', 'nutritionValue', 'growthValue', 'riskValue',
    'plantImage', 'nextEventValue', 'growthImpulseValue', 'simTimeValue', 'boostUsageText',
    'overlayBurn', 'overlayDefMg', 'overlayDefN', 'overlayMoldWarning', 'overlayPestMites', 'overlayPestThrips',
    'careActionBtn', 'analyzeActionBtn', 'boostActionBtn', 'openDiagnosisBtn',
    'backdrop', 'careSheet', 'eventSheet', 'dashboardSheet', 'diagnosisSheet',
    'careCategoryList', 'careActionList', 'careFeedback', 'eventStateBadge', 'eventTitle', 'eventText', 'eventMeta', 'eventOptionList',
    'pushSubscribeBtn', 'clearLogBtn', 'lastEventValue', 'lastChoiceValue', 'logList',
    'landing', 'startRunBtn', 'setupMode', 'setupLight', 'setupMedium', 'setupPotSize', 'setupGenetics'
  ];

  const missing = requiredKeys.filter((key) => !ui[key]);
  if (missing.length) {
    console.error('GrowSim konnte nicht initialisiert werden. Fehlende UI-Elemente:', missing);
    return false;
  }

  return true;
}

function applyStatusDrift(elapsedMs) {
  const minutes = elapsedMs / 60_000;
  if (minutes <= 0) {
    state.sim.growthImpulse = 0;
    return;
  }

  state.status.water -= 0.35 * minutes;
  state.status.nutrition -= 0.2 * minutes;

  // Good conditions lower stress slowly; deficits increase it.
  let stressDelta = 0.08 * minutes;
  if (state.status.water >= 55 && state.status.nutrition >= 50 && state.status.risk <= 40) {
    stressDelta -= 0.24 * minutes;
  }
  if (state.status.water < 30) {
    stressDelta += 0.45 * minutes;
  }
  if (state.status.nutrition < 30) {
    stressDelta += 0.35 * minutes;
  }
  state.status.stress += stressDelta;

  let riskDelta = 0.08 * minutes + ((state.status.stress / 100) * 0.26 * minutes);
  if (state.status.water > 90 || state.status.water < 18) {
    riskDelta += 0.36 * minutes;
  }
  state.status.risk += riskDelta;

  let healthDelta = (-0.04 * minutes) - ((state.status.stress / 100) * 0.52 * minutes) - ((state.status.risk / 100) * 0.38 * minutes);
  if (state.status.water >= 50 && state.status.nutrition >= 45 && state.status.stress <= 35 && state.status.risk <= 35) {
    healthDelta += 0.22 * minutes;
  }
  state.status.health += healthDelta;

  const impulseRaw = (state.status.health - state.status.stress - (state.status.risk * 0.45)) / 35;
  state.sim.growthImpulse = clamp(impulseRaw, -3, 3);

  clampStatus();
}

function advanceGrowthTick(elapsedSimMs) {
  if (state.growth.phase === 'dead') {
    state.growth.stageProgress = 1;
    return;
  }

  if (state.status.health <= 0 || state.status.risk >= 100) {
    enterDeadPhase();
    return;
  }

  updateLifecycleAverages(elapsedSimMs);
  updateQualityTier();

  const simDay = simDayFloat();
  const nextStageIndex = state.growth.stageIndex + 1;

  if (nextStageIndex < STAGE_DEFS.length && canAdvanceToStage(nextStageIndex, simDay)) {
    setGrowthStageIndex(nextStageIndex);
  }

  state.growth.stageProgress = computeStageProgress(simDay, state.growth.stageIndex);
  state.status.growth = round2(computeGrowthPercent());
}

function canAdvanceToStage(targetStageIndex, simDay) {
  const targetDef = STAGE_DEFS[targetStageIndex];
  if (!targetDef) {
    return false;
  }

  const deterministicDelayDays = deterministicStageDelayDays(targetStageIndex);
  const dayReady = simDay >= (targetDef.simDayStart + deterministicDelayDays);
  const healthReady = state.status.health >= targetDef.minHealth;
  const stressReady = state.status.stress <= targetDef.maxStress;

  if (targetStageIndex === STAGE_DEFS.length - 1) {
    if (state.growth.qualityTier === 'perfect') {
      state.growth.qualityLocked = true;
      return dayReady && healthReady && stressReady;
    }
    return dayReady;
  }

  return dayReady && healthReady && stressReady;
}

function setGrowthStageIndex(stageIndex) {
  const safeIndex = clampInt(stageIndex, 0, STAGE_DEFS.length - 1);
  const stageDef = STAGE_DEFS[safeIndex];

  state.growth.stageIndex = safeIndex;
  state.growth.phase = stageDef.phase;
  state.growth.stageName = stageAssetKeyForIndex(safeIndex);
  state.growth.lastValidStageName = state.growth.stageName;

  addLog('stage', `Stage erreicht: ${safeIndex + 1} ${stageDef.label}`, {
    simDay: round2(simDayFloat()),
    health: round2(state.status.health),
    stress: round2(state.status.stress),
    quality: state.growth.qualityTier
  });
}

function enterDeadPhase() {
  state.growth.phase = 'dead';
  state.growth.stageProgress = 1;
  state.growth.stageName = state.growth.lastValidStageName || 'stage_01';
  addLog('system', 'Todesphase erreicht', { stageName: state.growth.stageName });
}

function computeGrowthPercent() {
  if (state.growth.phase === 'dead') {
    return 0;
  }
  const stageUnit = state.growth.stageIndex + state.growth.stageProgress;
  return clamp((stageUnit / STAGE_DEFS.length) * 100, 0, 100);
}

function computeStageProgress(simDay, stageIndex) {
  const current = STAGE_DEFS[clampInt(stageIndex, 0, STAGE_DEFS.length - 1)];
  const next = STAGE_DEFS[Math.min(STAGE_DEFS.length - 1, stageIndex + 1)];

  if (!current || !next || current.index === next.index) {
    return simDay >= TOTAL_LIFECYCLE_SIM_DAYS ? 1 : 0;
  }

  const startDay = current.simDayStart + deterministicStageDelayDays(current.index);
  const endDay = next.simDayStart + deterministicStageDelayDays(next.index);
  const span = Math.max(0.25, endDay - startDay);
  return clamp((simDay - startDay) / span, 0, 1);
}

function updateLifecycleAverages(elapsedSimMs) {
  const observed = Math.max(0, Number(elapsedSimMs) || 0);
  if (observed <= 0) {
    return;
  }

  const totalObserved = state.growth.observedSimMs + observed;
  state.growth.averageHealth = ((state.growth.averageHealth * state.growth.observedSimMs) + (state.status.health * observed)) / totalObserved;
  state.growth.averageStress = ((state.growth.averageStress * state.growth.observedSimMs) + (state.status.stress * observed)) / totalObserved;
  state.growth.observedSimMs = totalObserved;
}

function updateQualityTier() {
  const avgHealth = state.growth.averageHealth;
  const avgStress = state.growth.averageStress;

  if (avgHealth >= 80 && avgStress <= 30 && state.status.stress <= 30) {
    state.growth.qualityTier = 'perfect';
    return;
  }

  if (avgHealth < 50 || avgStress >= 50 || state.status.stress >= 65) {
    state.growth.qualityTier = 'degraded';
    return;
  }

  state.growth.qualityTier = 'normal';
}

function simDayFloat() {
  const elapsed = Math.max(0, state.sim.simTimeMs - state.sim.simEpochMs);
  return clamp(elapsed / SIM_DAY_MS, 0, TOTAL_LIFECYCLE_SIM_DAYS);
}

function deterministicStageDelayDays(stageIndex) {
  if (stageIndex <= 0) {
    return 0;
  }
  const u = deterministicUnitFloat(`stage_delay:${stageIndex}`);
  return round2((u - 0.5) * 0.6);
}

function stageAssetKeyForIndex(stageIndex) {
  return `stage_${String(stageIndex + 1).padStart(2, '0')}`;
}

function runEventStateMachine(nowMs) {
  if (state.event.machineState === 'resolved') {
    enterEventCooldown(nowMs);
  }

  if (state.event.machineState === 'cooldown') {
    if (nowMs >= state.event.cooldownUntilMs) {
      state.event.machineState = 'idle';
      addLog('system', 'Abklingzeit beendet, Status wieder inaktiv', null);
    }
    if (nowMs >= state.event.nextEventAtMs) {
      scheduleNextEventRoll(nowMs, 'cooldown');
      schedulePushIfAllowed(false);
    }
  }

  if (state.event.machineState === 'activeEvent' && nowMs >= state.event.nextEventAtMs) {
    scheduleNextEventRoll(nowMs, 'active_event_pending');
    schedulePushIfAllowed(false);
  }

  if (state.event.machineState === 'idle' && nowMs >= state.event.nextEventAtMs) {
    if (!state.sim.isDaytime) {
      state.event.nextEventAtMs = nextDaytimeRealMs(nowMs, state.sim.simTimeMs);
      addLog('event_roll', 'Nachtphase: Ereigniswurf auf Tagesbeginn verschoben', {
        nextEventAtMs: state.event.nextEventAtMs
      });
      schedulePushIfAllowed(false);
      return;
    }

    const roll = deterministicRoll();
    const trigger = shouldTriggerEvent(roll);

    addLog('event_roll', trigger ? 'Ereigniswurf erfolgreich' : 'Ereigniswurf nicht erfolgreich', {
      roll,
      threshold: eventThreshold(),
      simHour: simHour(state.sim.simTimeMs),
      at: nowMs
    });

    if (trigger) {
      activateEvent(nowMs);
    }

    scheduleNextEventRoll(nowMs, 'post_roll');
    schedulePushIfAllowed(false);
  }

  if (state.event.machineState === 'activeEvent') {
    state.ui.openSheet = 'event';
  }
}

function activateEvent(nowMs) {
  const catalog = state.event.catalog;
  if (!Array.isArray(catalog) || !catalog.length) {
    return;
  }

  const eligible = eligibleEventsForNow(nowMs);
  if (!eligible.length) {
    addLog('event_roll', 'Keine passenden Ereignisse fuer aktuellen Zustand', {
      simDay: Math.floor(simDayFloat()),
      at: nowMs
    });
    return;
  }

  const eventDef = selectEventDeterministically(eligible, nowMs);
  if (!eventDef) {
    return;
  }

  const options = eventDef.options.slice(0, 3);

  state.event.machineState = 'activeEvent';
  state.event.activeEventId = eventDef.id;
  state.lastEventId = eventDef.id;
  state.event.activeEventTitle = eventDef.title;
  state.event.activeEventText = eventDef.description;
  state.event.activeLearningNote = eventDef.learningNote || '';
  state.event.activeOptions = options;
  state.event.activeSeverity = eventDef.severity || 3;
  state.event.activeCooldownRealMinutes = clamp(Number(eventDef.cooldownRealMinutes) || 120, 10, 24 * 60);
  state.event.activeCategory = eventDef.category || 'generic';
  state.event.activeTags = Array.isArray(eventDef.tags) ? eventDef.tags.slice(0, 5) : [];
  state.event.lastEventAtMs = nowMs;

  state.events.scheduler.lastEventId = eventDef.id;
  state.events.scheduler.lastEventRealTimeMs = nowMs;
  state.events.scheduler.lastEventCategory = eventDef.category || 'generic';
  state.events.active = {
    id: eventDef.id,
    title: eventDef.title,
    description: eventDef.description,
    category: eventDef.category || 'generic',
    learningNote: eventDef.learningNote || ''
  };

  addLog('event_shown', `Ereignis ausgewaehlt: ${eventDef.id}`, {
    title: eventDef.title,
    severity: state.event.activeSeverity,
    category: eventDef.category || 'generic'
  });
}

function eligibleEventsForNow(nowMs) {
  const cooldowns = state.events.scheduler.eventCooldowns || {};
  return state.event.catalog
    .filter((eventDef) => isEventEligible(eventDef, cooldowns, nowMs))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function isEventEligible(eventDef, cooldowns, nowMs) {
  if (!eventDef || !eventDef.id) {
    return false;
  }

  const blockedUntil = Number(cooldowns[eventDef.id] || 0);
  if (blockedUntil > nowMs) {
    return false;
  }

  return evaluateEventTriggers(eventDef.triggers || {});
}

function evaluateEventTriggers(triggers) {
  const t = triggers && typeof triggers === 'object' ? triggers : {};

  if (t.stage && typeof t.stage === 'object') {
    const stageIndex = state.growth.stageIndex + 1;
    if (Number.isFinite(Number(t.stage.min)) && stageIndex < Number(t.stage.min)) {
      return false;
    }
    if (Number.isFinite(Number(t.stage.max)) && stageIndex > Number(t.stage.max)) {
      return false;
    }
  }

  if (t.setup && typeof t.setup === 'object') {
    if (!evaluateSetupConstraints(t.setup)) {
      return false;
    }
  }

  const all = Array.isArray(t.all) ? t.all : [];
  const any = Array.isArray(t.any) ? t.any : [];

  if (all.length && !all.every(evaluateTriggerCondition)) {
    return false;
  }
  if (any.length && !any.some(evaluateTriggerCondition)) {
    return false;
  }

  return true;
}

function evaluateSetupConstraints(setupRule) {
  const setup = state.setup || {};
  for (const [key, values] of Object.entries(setupRule)) {
    if (!Array.isArray(values)) {
      continue;
    }
    const prop = key.replace(/In$/, '');
    const current = setup[prop];
    if (!values.map(String).includes(String(current))) {
      return false;
    }
  }
  return true;
}

function evaluateTriggerCondition(condition) {
  if (!condition || typeof condition !== 'object') {
    return false;
  }

  const field = String(condition.field || '').trim();
  const op = String(condition.op || '==').trim();
  const rhs = condition.value;
  const lhs = resolveTriggerField(field);

  if (op === 'in') {
    return Array.isArray(rhs) && rhs.map(String).includes(String(lhs));
  }
  if (op === 'not_in') {
    return Array.isArray(rhs) && !rhs.map(String).includes(String(lhs));
  }

  const leftNum = Number(lhs);
  const rightNum = Number(rhs);
  const numeric = Number.isFinite(leftNum) && Number.isFinite(rightNum);

  if (op === '==') return lhs === rhs || String(lhs) === String(rhs);
  if (op === '!=') return !(lhs === rhs || String(lhs) === String(rhs));
  if (!numeric) return false;
  if (op === '>') return leftNum > rightNum;
  if (op === '>=') return leftNum >= rightNum;
  if (op === '<') return leftNum < rightNum;
  if (op === '<=') return leftNum <= rightNum;
  return false;
}

function resolveTriggerField(fieldPath) {
  if (!fieldPath) {
    return undefined;
  }

  if (fieldPath.startsWith('status.')) {
    return state.status[fieldPath.split('.')[1]];
  }
  if (fieldPath === 'plant.stageIndex') {
    return state.growth.stageIndex + 1;
  }
  if (fieldPath === 'plant.stageKey') {
    return state.growth.stageName;
  }
  if (fieldPath.startsWith('setup.')) {
    return (state.setup || {})[fieldPath.split('.')[1]];
  }
  if (fieldPath === 'simulation.isDaytime') {
    return state.sim.isDaytime;
  }

  return undefined;
}

function onEventOptionClick(optionId) {
  if (state.event.machineState !== 'activeEvent') {
    return;
  }

  const choice = state.event.activeOptions.find((option) => option.id === optionId);
  if (!choice) {
    return;
  }

  const before = snapshotStatus();
  applyChoiceEffects(choice.effects || {});

  const triggeredSideEffects = [];
  for (const side of Array.isArray(choice.sideEffects) ? choice.sideEffects : []) {
    if (!evaluateCondition(side.when || 'true')) {
      continue;
    }
    const chance = clamp(Number(side.chance), 0, 1);
    const roll = deterministicUnitFloat(`event_side:${state.event.activeEventId}:${choice.id}:${side.id || 'side'}:${state.sim.tickCount}`);
    if (roll <= chance) {
      applyChoiceEffects(side.effects || {});
      triggeredSideEffects.push(side.id || 'side');
    }
  }

  const after = snapshotStatus();
  const deltaSummary = summarizeDelta(before, after);

  state.event.lastChoiceId = choice.id;
  state.lastChoiceId = choice.id;
  state.event.machineState = 'resolved';

  const triggerSnapshot = {
    simDay: Math.floor(simDayFloat()),
    stageIndex: state.growth.stageIndex + 1,
    water: round2(state.status.water),
    nutrition: round2(state.status.nutrition),
    health: round2(state.status.health),
    stress: round2(state.status.stress),
    risk: round2(state.status.risk),
    growth: round2(state.status.growth),
    setup: {
      mode: state.setup && state.setup.mode ? state.setup.mode : null,
      medium: state.setup && state.setup.medium ? state.setup.medium : null,
      light: state.setup && state.setup.light ? state.setup.light : null
    }
  };

  const historyEntry = {
    type: 'event',
    eventId: state.event.activeEventId,
    category: state.event.activeCategory || 'generic',
    optionId: choice.id,
    optionLabel: choice.label,
    learningNote: state.event.activeLearningNote || '',
    triggerSnapshot,
    effectsApplied: deltaSummary,
    sideEffectsTriggered: triggeredSideEffects,
    atSimTimeMs: state.sim.simTimeMs,
    atRealTimeMs: Date.now()
  };

  state.history.events.push(historyEntry);
  state.events.history.push(historyEntry);

  addLog('choice', `Option gewaehlt: ${state.event.activeEventId}/${choice.id}`, {
    effects: choice.effects || {},
    sideEffects: triggeredSideEffects,
    effectsApplied: deltaSummary,
    followUps: choice.followUps || []
  });

  runEventStateMachine(state.sim.nowMs);
  syncCanonicalStateShape();
  renderAll();
  schedulePersistState(true);
}

function applyChoiceEffects(effects) {
  for (const [metric, delta] of Object.entries(effects)) {
    if (!Number.isFinite(delta)) {
      continue;
    }

    if (metric === 'growth') {
      applyGrowthPercentDelta(delta);
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(state.status, metric)) {
      state.status[metric] += delta;
    }
  }

  clampStatus();
}

function applyGrowthPercentDelta(delta) {
  const current = computeGrowthPercent();
  const target = clamp(current + delta, 0, 100);
  setGrowthFromPercent(target);
  state.status.growth = round2(computeGrowthPercent());
}

function setGrowthFromPercent(percent) {
  if (state.growth.phase === 'dead') {
    return;
  }

  const units = clamp((percent / 100) * STAGE_DEFS.length, 0, STAGE_DEFS.length);
  const stageIndex = Math.min(STAGE_DEFS.length - 1, Math.floor(units));
  setGrowthStageIndex(stageIndex);
  state.growth.stageProgress = clamp(units - stageIndex, 0, 1);
}

function enterEventCooldown(nowMs) {
  const activeEventId = state.event.activeEventId;
  const perEventCooldownMs = Math.round((Number(state.event.activeCooldownRealMinutes) || 120) * 60 * 1000);

  state.event.machineState = 'cooldown';
  state.event.cooldownUntilMs = nowMs + cooldownMs();
  state.event.activeEventId = null;
  state.event.activeEventTitle = '';
  state.event.activeEventText = '';
  state.event.activeOptions = [];
  state.event.activeSeverity = 1;
  state.event.activeCooldownRealMinutes = 120;
  state.event.activeCategory = 'generic';
  state.event.activeTags = [];

  if (activeEventId) {
    state.events.scheduler.eventCooldowns[activeEventId] = nowMs + perEventCooldownMs;
  }
  state.events.active = null;

  addLog('system', 'Ereignis abgeschlossen, Abklingzeit gestartet', {
    cooldownUntilMs: state.event.cooldownUntilMs,
    eventId: activeEventId,
    perEventCooldownMs
  });
}

function deterministicRoll() {
  const bucket = Math.floor(state.event.nextEventAtMs / EVENT_ROLL_MIN_REAL_MS);
  const riskBucket = Math.round(state.status.risk / 5);
  return deterministicUnitFloat(`roll:${bucket}:${riskBucket}:${state.sim.tickCount}`);
}

function eventThreshold() {
  const base = 0.34;
  const riskInfluence = state.status.risk / 340;
  return clamp(base + riskInfluence, 0.15, 0.88);
}

function shouldTriggerEvent(roll) {
  return roll < eventThreshold();
}

function deterministicEventDelayMs(nowMs) {
  const min = EVENT_ROLL_MIN_REAL_MS;
  const max = EVENT_ROLL_MAX_REAL_MS;
  const span = Math.max(0, max - min);
  const bucket = Math.floor(nowMs / min);
  const u = deterministicUnitFloat(`delay:${bucket}`);
  return min + Math.floor(u * span);
}

function cooldownMs() {
  return EVENT_COOLDOWN_MS;
}

function onCareApply() {
  const result = applyAction('watering_medium_deep');
  if (!result.ok) {
    addLog('action', `Aktion blockiert: ${result.reason}`, { actionId: 'watering_medium_deep' });
  }

  closeSheet();
  renderAll();
  schedulePersistState(true);
}

function applyAction(actionId) {
  const action = state.actions.byId[actionId];
  if (!action) {
    state.actions.lastResult = { ok: false, reason: `unknown_action:${actionId}`, actionId, atRealTimeMs: Date.now() };
    return { ok: false, reason: `unknown_action:${actionId}` };
  }

  const nowMs = Date.now();
  const cooldownUntil = Number(state.actions.cooldowns[action.id] || 0);
  if (cooldownUntil > nowMs) {
    const result = { ok: false, reason: `cooldown_active:${Math.ceil((cooldownUntil - nowMs) / 1000)}s` };
    state.actions.lastResult = { ok: false, reason: result.reason, actionId: action.id, atRealTimeMs: nowMs };
    return result;
  }

  const triggerCheck = validateActionTrigger(action);
  if (!triggerCheck.ok) {
    state.actions.lastResult = { ok: false, reason: triggerCheck.reason, actionId: action.id, atRealTimeMs: nowMs };
    return triggerCheck;
  }

  const preCheck = validateActionPrerequisites(action);
  if (!preCheck.ok) {
    state.actions.lastResult = { ok: false, reason: preCheck.reason, actionId: action.id, atRealTimeMs: nowMs };
    return preCheck;
  }

  const before = snapshotStatus();

  applyEffectsObject(action.effects.immediate || {});
  scheduleActionOverTimeEffect(action, nowMs);

  const triggeredSideEffects = [];
  for (const side of action.sideEffects) {
    if (!side || typeof side !== 'object') {
      continue;
    }
    const conditionMet = evaluateCondition(side.when || 'true');
    if (!conditionMet) {
      continue;
    }
    const chance = clamp(Number(side.chance), 0, 1);
    const roll = deterministicUnitFloat(`action_side:${action.id}:${side.id || 'side'}:${state.sim.tickCount}:${Math.floor(state.sim.simTimeMs / 60000)}`);
    if (roll <= chance) {
      applyEffectsObject(side.deltas || {});
      triggeredSideEffects.push(side.id || 'side_effect');
    }
  }

  const cooldownMs = Math.round((Number(action.cooldownRealMinutes) || 0) * 60 * 1000);
  state.actions.cooldowns[action.id] = nowMs + cooldownMs;

  const after = snapshotStatus();
  const deltaSummary = summarizeDelta(before, after);

  addLog('action', `Action: ${action.label}`, {
    type: 'action',
    id: action.id,
    category: action.category,
    intensity: action.intensity,
    label: action.label,
    simTime: state.sim.simTimeMs,
    realTime: nowMs,
    sideEffects: triggeredSideEffects,
    deltaSummary
  });

  clampStatus();
  updateVisibleOverlays();
  syncCanonicalStateShape();
  state.actions.lastResult = { ok: true, reason: 'ok', actionId: action.id, atRealTimeMs: nowMs };
  schedulePersistState(true);

  return { ok: true, id: action.id, deltaSummary, sideEffects: triggeredSideEffects };
}

function validateActionTrigger(action) {
  const trigger = action.trigger || {};
  if (trigger.timeWindow === 'daytime_only' && !state.sim.isDaytime) {
    return { ok: false, reason: 'outside_time_window:daytime_only' };
  }

  if (Number.isFinite(trigger.minStageIndex) && state.growth.stageIndex < Number(trigger.minStageIndex)) {
    return { ok: false, reason: `stage_too_low:${state.growth.stageIndex}<${trigger.minStageIndex}` };
  }

  return { ok: true };
}

function validateActionPrerequisites(action) {
  const pre = action.prerequisites || {};
  const min = pre.min && typeof pre.min === 'object' ? pre.min : {};
  const max = pre.max && typeof pre.max === 'object' ? pre.max : {};

  for (const [key, value] of Object.entries(min)) {
    if (!Number.isFinite(Number(value))) {
      continue;
    }
    const current = key in state.status ? state.status[key] : null;
    if (current !== null && current < Number(value)) {
      return { ok: false, reason: `prereq_min_failed:${key}` };
    }
  }

  for (const [key, value] of Object.entries(max)) {
    if (!Number.isFinite(Number(value))) {
      continue;
    }
    const current = key in state.status ? state.status[key] : null;
    if (current !== null && current > Number(value)) {
      return { ok: false, reason: `prereq_max_failed:${key}` };
    }
  }

  return { ok: true };
}

function scheduleActionOverTimeEffect(action, nowMs) {
  const durationMs = Math.round((Number(action.effects.durationSimMinutes) || 0) * 60 * 1000);
  const overTime = action.effects.overTime || {};
  if (durationMs <= 0 || !Object.keys(overTime).length) {
    return;
  }

  state.actions.activeEffects.push({
    id: `${action.id}:${nowMs}:${state.sim.tickCount}`,
    actionId: action.id,
    remainingSimMs: durationMs,
    rates: overTime
  });
}

function applyActiveActionEffects(elapsedSimMs) {
  if (!Array.isArray(state.actions.activeEffects) || !state.actions.activeEffects.length) {
    return;
  }

  const stillActive = [];
  for (const effect of state.actions.activeEffects) {
    const stepMs = clamp(elapsedSimMs, 0, effect.remainingSimMs);
    if (stepMs > 0) {
      applyOverTimeRates(effect.rates || {}, stepMs);
      effect.remainingSimMs -= stepMs;
    }
    if (effect.remainingSimMs > 0) {
      stillActive.push(effect);
    }
  }

  state.actions.activeEffects = stillActive;
  clampStatus();
}

function applyOverTimeRates(rates, elapsedSimMs) {
  const simHours = elapsedSimMs / (60 * 60 * 1000);
  for (const [key, perHour] of Object.entries(rates || {})) {
    const delta = Number(perHour) * simHours;
    if (!Number.isFinite(delta)) {
      continue;
    }

    if (key === 'growthPerHour') {
      applyGrowthPercentDelta(delta);
      continue;
    }

    const metric = key.replace(/PerHour$/, '');
    if (Object.prototype.hasOwnProperty.call(state.status, metric)) {
      state.status[metric] += delta;
    }
  }
}

function applyEffectsObject(effects) {
  for (const [metric, deltaRaw] of Object.entries(effects || {})) {
    const delta = Number(deltaRaw);
    if (!Number.isFinite(delta)) {
      continue;
    }

    if (metric === 'growth') {
      applyGrowthPercentDelta(delta);
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(state.status, metric)) {
      state.status[metric] += delta;
    }
  }

  clampStatus();
}

function evaluateCondition(conditionExpr) {
  const expr = String(conditionExpr || 'true').trim();
  if (!expr || expr.toLowerCase() === 'true') {
    return true;
  }

  const orParts = expr.split(/\s+OR\s+/i);
  for (const part of orParts) {
    const andParts = part.split(/\s+AND\s+/i);
    const andResult = andParts.every((token) => evaluateAtomicCondition(token.trim()));
    if (andResult) {
      return true;
    }
  }
  return false;
}

function evaluateAtomicCondition(token) {
  const m = token.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(>=|<=|==|>|<)\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) {
    return false;
  }

  const key = m[1];
  const op = m[2];
  const rhs = Number(m[3]);
  const lhs = key in state.status ? Number(state.status[key]) : NaN;
  if (!Number.isFinite(lhs) || !Number.isFinite(rhs)) {
    return false;
  }

  if (op === '>=') return lhs >= rhs;
  if (op === '<=') return lhs <= rhs;
  if (op === '==') return lhs === rhs;
  if (op === '>') return lhs > rhs;
  if (op === '<') return lhs < rhs;
  return false;
}

function snapshotStatus() {
  return {
    water: state.status.water,
    nutrition: state.status.nutrition,
    health: state.status.health,
    stress: state.status.stress,
    risk: state.status.risk,
    growth: state.status.growth
  };
}

function summarizeDelta(before, after) {
  const out = {};
  for (const key of Object.keys(before)) {
    out[key] = round2((after[key] || 0) - (before[key] || 0));
  }
  return out;
}

function onBoostAction() {
  const nowMs = Date.now();
  resetBoostDaily(nowMs);

  if (state.boost.boostUsedToday >= state.boost.boostMaxPerDay) {
    addLog('action', 'Boost wegen Tageslimit blockiert', { cap: state.boost.boostMaxPerDay });
    renderAll();
    return;
  }

  state.boost.boostUsedToday += 1;
  applyStatusDrift(BOOST_ADVANCE_MS);
  applyGrowthPercentDelta(6);

  state.event.nextEventAtMs = Math.max(nowMs, state.event.nextEventAtMs - BOOST_ADVANCE_MS);
  state.event.cooldownUntilMs = Math.max(nowMs, state.event.cooldownUntilMs - BOOST_ADVANCE_MS);

  runEventStateMachine(nowMs);
  updateVisibleOverlays();

  addLog('action', '+30-Minuten-Boost angewendet', {
    usedToday: state.boost.boostUsedToday,
    nextEventAtMs: state.event.nextEventAtMs
  });

  renderAll();
  schedulePersistState(true);
}

function onClearLog() {
  state.historyLog = [];
  addLog('system', 'Protokoll geleert', null);
  renderLogList(true);
  schedulePersistState(true);
}

function resetBoostDaily(nowMs) {
  const currentStamp = dayStamp(nowMs);
  if (state.boost.dayStamp !== currentStamp) {
    state.boost.dayStamp = currentStamp;
    state.boost.boostUsedToday = 0;
    addLog('system', 'Taeglicher Boost-Zaehler zurueckgesetzt', { dayStamp: currentStamp });
  }
}

function dayStamp(timestampMs) {
  const d = new Date(timestampMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function alignToSimStartHour(realNowMs, startHour) {
  const d = new Date(realNowMs);
  d.setHours(clampInt(startHour, 0, 23), 0, 0, 0);
  return d.getTime();
}

function simHour(simTimeMs) {
  return new Date(simTimeMs).getHours();
}

function isDaytimeAtSimTime(simTimeMs) {
  const hour = simHour(simTimeMs);
  return hour >= SIM_DAY_START_HOUR && hour < SIM_NIGHT_START_HOUR;
}

function nextDaytimeRealMs(realNowMs, simTimeMs) {
  const simDate = new Date(simTimeMs);
  const shifted = new Date(simDate.getTime());

  if (simHour(simTimeMs) >= SIM_NIGHT_START_HOUR) {
    shifted.setDate(shifted.getDate() + 1);
  }

  shifted.setHours(SIM_DAY_START_HOUR, 0, 0, 0);
  const simDeltaMs = Math.max(0, shifted.getTime() - simTimeMs);
  const realDeltaMs = Math.ceil(simDeltaMs / state.sim.timeCompression);
  return realNowMs + realDeltaMs;
}

function formatSimClock(simTimeMs) {
  return new Date(simTimeMs).toLocaleTimeString('de-DE');
}

function deterministicUnitFloat(contextKey) {
  const hash = hashString(`${state.sim.globalSeed}|${state.sim.plantId}|${contextKey}`);
  return (hash % 1_000_000) / 1_000_000;
}

function hashString(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clampStatus() {
  state.status.health = clamp(state.status.health, 0, 100);
  state.status.stress = clamp(state.status.stress, 0, 100);
  state.status.water = clamp(state.status.water, 0, 100);
  state.status.nutrition = clamp(state.status.nutrition, 0, 100);
  state.status.growth = clamp(state.status.growth, 0, 100);
  state.status.risk = clamp(state.status.risk, 0, 100);
}

function updateVisibleOverlays() {
  const overlays = [];

  if (state.status.stress >= 80) {
    overlays.push('overlay_burn');
  }
  if (state.status.nutrition <= 28) {
    overlays.push('overlay_def_n');
  } else if (state.status.nutrition <= 45) {
    overlays.push('overlay_def_mg');
  }
  if (state.status.risk >= 78) {
    overlays.push('overlay_mold_warning');
  }
  if (state.status.risk >= 62) {
    overlays.push('overlay_pest_mites');
  }
  if (state.status.risk >= 70 && state.status.stress >= 55) {
    overlays.push('overlay_pest_thrips');
  }

  state.ui.visibleOverlayIds = overlays;
}

function renderAll() {
  renderHud();
  renderSheets();
  renderCareSheet();
  renderEventSheet();
  renderDashboardSummary();
  renderLogList();
  renderLanding();
}

function renderHud() {
  const phaseLabel = PHASE_LABEL_DE[state.growth.phase] || PHASE_LABEL_DE.seedling;
  const dayNight = state.sim.isDaytime ? 'Tag' : 'Nacht';
  const statusText = `Phase: ${phaseLabel} · ${dayNight}`;
  const boostText = `Werbeunterstuetzt · ${state.boost.boostUsedToday}/${state.boost.boostMaxPerDay} heute`;

  if (ui.statusPill.textContent !== statusText) {
    ui.statusPill.textContent = statusText;
  }
  if (ui.boostUsageText.textContent !== boostText) {
    ui.boostUsageText.textContent = boostText;
  }

  setRing(ui.healthRing, ui.healthValue, state.status.health);
  setRing(ui.stressRing, ui.stressValue, state.status.stress);
  setRing(ui.waterRing, ui.waterValue, state.status.water);
  setRing(ui.nutritionRing, ui.nutritionValue, state.status.nutrition);
  setRing(ui.growthRing, ui.growthValue, state.status.growth);
  setRing(ui.riskRing, ui.riskValue, state.status.risk);

  if (ui.plantImage && ui.plantImage.dataset.stageName !== state.growth.stageName) {
    ui.plantImage.src = plantAssetPath(state.growth.stageName);
    ui.plantImage.dataset.stageName = state.growth.stageName;
  }

  const eventInMs = state.event.nextEventAtMs - state.sim.nowMs;
  ui.nextEventValue.textContent = formatCountdown(eventInMs);
  ui.growthImpulseValue.textContent = state.sim.growthImpulse.toFixed(2);
  ui.simTimeValue.textContent = formatSimClock(state.sim.simTimeMs);

  renderOverlayVisibility();
}

function setRing(ringNode, textNode, value) {
  const rounded = Math.round(value);
  const roundedText = String(rounded);

  if (ringNode.dataset.value !== roundedText) {
    ringNode.style.setProperty('--value', roundedText);
    ringNode.dataset.value = roundedText;
  }
  if (textNode.textContent !== roundedText) {
    textNode.textContent = roundedText;
  }
}

function renderOverlayVisibility() {
  const nodes = {
    overlay_burn: ui.overlayBurn,
    overlay_def_mg: ui.overlayDefMg,
    overlay_def_n: ui.overlayDefN,
    overlay_mold_warning: ui.overlayMoldWarning,
    overlay_pest_mites: ui.overlayPestMites,
    overlay_pest_thrips: ui.overlayPestThrips
  };

  for (const [overlayId, node] of Object.entries(nodes)) {
    const visible = state.ui.visibleOverlayIds.includes(overlayId);
    node.classList.toggle('hidden', !visible);
  }
}

function renderSheets() {
  const activeSheet = state.ui.openSheet;
  const showBackdrop = activeSheet !== null;

  ui.backdrop.classList.toggle('hidden', !showBackdrop);
  ui.backdrop.setAttribute('aria-hidden', String(!showBackdrop));

  toggleSheet(ui.careSheet, activeSheet === 'care');
  toggleSheet(ui.eventSheet, activeSheet === 'event');
  toggleSheet(ui.dashboardSheet, activeSheet === 'dashboard');
  toggleSheet(ui.diagnosisSheet, activeSheet === 'diagnosis');
}

function toggleSheet(sheetNode, visible) {
  sheetNode.classList.toggle('hidden', !visible);
  sheetNode.setAttribute('aria-hidden', String(!visible));
}

function renderCareSheet(force = false) {
  if (!force && state.ui.openSheet !== 'care') {
    return;
  }

  const catalog = Array.isArray(state.actions.catalog) ? state.actions.catalog : [];
  const categoryOrder = ['watering', 'fertilizing', 'training', 'environment'];
  const categoryLabels = {
    watering: 'Watering',
    fertilizing: 'Fertilizing',
    training: 'Training',
    environment: 'Environment'
  };

  const availableCategories = categoryOrder.filter((category) => catalog.some((action) => action.category === category));
  if (!availableCategories.length) {
    ui.careCategoryList.replaceChildren();
    ui.careActionList.replaceChildren();
    setCareFeedback('error', 'Keine Aktionen geladen.');
    return;
  }

  if (!state.ui.care || !availableCategories.includes(state.ui.care.selectedCategory)) {
    state.ui.care = state.ui.care || {};
    state.ui.care.selectedCategory = availableCategories[0];
  }

  renderCareCategoryButtons(availableCategories, categoryLabels);
  renderCareActionButtons(state.ui.care.selectedCategory);
  renderCareFeedback();
}

function renderCareCategoryButtons(categories, labels) {
  const signature = categories.join('|') + `|selected:${state.ui.care.selectedCategory}`;
  if (ui.careCategoryList.dataset.signature === signature) {
    return;
  }

  ui.careCategoryList.dataset.signature = signature;
  ui.careCategoryList.replaceChildren();

  for (const category of categories) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'care-category-btn';
    if (state.ui.care.selectedCategory === category) {
      btn.classList.add('is-active');
    }
    btn.textContent = labels[category] || category;
    btn.addEventListener('click', () => {
      state.ui.care.selectedCategory = category;
      setCareFeedback('info', `${labels[category] || category} ausgewaehlt.`);
      renderCareSheet(true);
    });
    ui.careCategoryList.appendChild(btn);
  }
}

function renderCareActionButtons(category) {
  const actions = state.actions.catalog
    .filter((action) => action.category === category)
    .sort((a, b) => intensityRank(a.intensity) - intensityRank(b.intensity));

  const signature = actions.map((action) => {
    const cooldownUntil = Number(state.actions.cooldowns[action.id] || 0);
    return `${action.id}:${cooldownUntil}`;
  }).join('|');

  if (ui.careActionList.dataset.signature === signature) {
    return;
  }

  ui.careActionList.dataset.signature = signature;
  ui.careActionList.replaceChildren();

  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'care-action-btn';

    const cooldownLeft = Math.max(0, Number(state.actions.cooldowns[action.id] || 0) - Date.now());
    const cooldownText = cooldownLeft > 0
      ? `Cooldown ${Math.ceil(cooldownLeft / 60000)}m`
      : `Cooldown ${Math.round(action.cooldownRealMinutes || 0)}m`;

    button.innerHTML = `<div><strong>${action.label}</strong><div class="care-action-meta">${labelForIntensity(action.intensity)}</div></div><span class="care-action-meta">${cooldownText}</span>`;

    button.addEventListener('click', () => {
      const result = applyAction(action.id);
      if (result.ok) {
        setCareFeedback('success', `${action.label} ausgefuehrt.`);
      } else {
        setCareFeedback('error', explainActionFailure(result.reason));
      }
      renderCareSheet(true);
      renderHud();
    });

    ui.careActionList.appendChild(button);
  }
}

function renderCareFeedback() {
  const feedback = (state.ui.care && state.ui.care.feedback) || { kind: 'info', text: 'Bereit.' };
  ui.careFeedback.textContent = feedback.text;
  ui.careFeedback.classList.toggle('is-success', feedback.kind === 'success');
  ui.careFeedback.classList.toggle('is-error', feedback.kind === 'error');
}

function setCareFeedback(kind, text) {
  state.ui.care = state.ui.care || {};
  state.ui.care.feedback = { kind, text };
  renderCareFeedback();
}

function labelForIntensity(intensity) {
  if (intensity === 'low') return 'Low';
  if (intensity === 'high') return 'High';
  return 'Medium';
}

function intensityRank(intensity) {
  if (intensity === 'low') return 0;
  if (intensity === 'medium') return 1;
  if (intensity === 'high') return 2;
  return 3;
}

function explainActionFailure(reason) {
  const value = String(reason || 'action_failed');
  if (value.startsWith('cooldown_active:')) {
    return `Aktion blockiert: ${value.replace('cooldown_active:', 'Cooldown noch ')}`;
  }
  if (value.startsWith('prereq_min_failed:') || value.startsWith('prereq_max_failed:')) {
    return `Voraussetzung nicht erfuellt (${value.split(':')[1] || 'unknown'}).`;
  }
  if (value.startsWith('outside_time_window:')) {
    return 'Aktion nur tagsueber verfuegbar.';
  }
  if (value.startsWith('stage_too_low:')) {
    return 'Aktion fuer diese Phase noch nicht freigeschaltet.';
  }
  return `Aktion blockiert (${value}).`;
}

function renderEventSheet() {
  if (state.ui.openSheet !== 'event' && state.event.machineState !== 'activeEvent') {
    return;
  }

  ui.eventStateBadge.textContent = `Status: ${translateEventState(state.event.machineState)}`;

  if (state.event.machineState === 'activeEvent') {
    ui.eventTitle.textContent = state.event.activeEventTitle;
    ui.eventText.textContent = state.event.activeEventText;
    ui.eventMeta.textContent = `Schweregrad: ${state.event.activeSeverity} | Tags: ${state.event.activeTags.join(', ') || '-'}`;

    const optionSignature = `${state.event.activeEventId}|${state.event.activeOptions.map((option) => `${option.id}:${option.label}`).join('|')}`;
    if (ui.eventOptionList.dataset.signature !== optionSignature) {
      ui.eventOptionList.dataset.signature = optionSignature;
      ui.eventOptionList.replaceChildren();
      for (const option of state.event.activeOptions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'event-option-btn';
        button.textContent = option.label;
        button.addEventListener('click', () => onEventOptionClick(option.id));
        ui.eventOptionList.appendChild(button);
      }
    }
    return;
  }

  if (state.event.machineState === 'cooldown') {
    const cooldownLeft = state.event.cooldownUntilMs - state.sim.nowMs;
    ui.eventTitle.textContent = 'Abklingzeit aktiv';
    ui.eventText.textContent = 'Das Ereignissystem befindet sich in der Abklingzeit.';
    ui.eventMeta.textContent = `Abklingzeit: ${formatCountdown(cooldownLeft)}`;
  } else {
    ui.eventTitle.textContent = 'Kein aktives Ereignis';
    ui.eventText.textContent = 'Ein Ereignis erscheint, sobald der naechste Wurf erfolgreich ist.';
    ui.eventMeta.textContent = `Naechster Wurf: ${formatCountdown(state.event.nextEventAtMs - state.sim.nowMs)}`;
  }

  if (ui.eventOptionList.childElementCount > 0) {
    ui.eventOptionList.dataset.signature = '';
    ui.eventOptionList.replaceChildren();
  }
}

function renderLogList(force = false) {
  if (!force && state.ui.openSheet !== 'dashboard') {
    return;
  }

  const signature = historyLogSignature();
  if (!force && signature === logRenderSignature) {
    return;
  }
  logRenderSignature = signature;

  ui.logList.replaceChildren();

  const entries = state.historyLog.slice().reverse();
  if (!entries.length) {
    const empty = document.createElement('li');
    empty.className = 'log-item';
    empty.textContent = 'Noch keine Protokolleintraege.';
    ui.logList.appendChild(empty);
    return;
  }

  for (const entry of entries) {
    const li = document.createElement('li');
    li.className = 'log-item';

    const time = document.createElement('span');
    time.className = 'log-time';
    time.textContent = `${new Date(entry.atMs).toLocaleTimeString('de-DE')} | ${entry.type}`;

    const text = document.createElement('span');
    text.className = 'log-text';
    text.textContent = entry.message;

    li.appendChild(time);
    li.appendChild(text);
    ui.logList.appendChild(li);
  }
}

function renderDashboardSummary() {
  if (!ui.lastEventValue || !ui.lastChoiceValue) {
    return;
  }

  ui.lastEventValue.textContent = state.lastEventId || '-';
  ui.lastChoiceValue.textContent = state.lastChoiceId || '-';
}

function historyLogSignature() {
  if (!state.historyLog.length) {
    return '0';
  }

  const newest = state.historyLog[state.historyLog.length - 1];
  return `${state.historyLog.length}:${newest.id}`;
}

function openSheet(name) {
  state.ui.openSheet = name;
  renderSheets();

  if (name === 'dashboard') {
    renderLogList(true);
  } else if (name === 'event') {
    renderEventSheet();
  } else if (name === 'care') {
    renderCareSheet(true);
  }
}

function hasSetup() {
  return Boolean(state.setup && Number.isFinite(Number(state.setup.createdAtReal)));
}

function renderLanding() {
  const visible = !hasSetup();
  ui.landing.classList.toggle('hidden', !visible);
  ui.landing.setAttribute('aria-hidden', String(!visible));
}

function onStartRun() {
  state.setup = {
    mode: ui.setupMode.value || 'indoor',
    light: ui.setupLight.value || 'medium',
    medium: ui.setupMedium.value || 'soil',
    potSize: ui.setupPotSize.value || 'medium',
    genetics: ui.setupGenetics.value || 'auto',
    createdAtReal: Date.now()
  };

  syncCanonicalStateShape();
  renderLanding();
  schedulePersistState(true);
  addLog('system', 'Setup gespeichert, Run gestartet', state.setup);
}

function withDebouncedAction(actionKey, buttonNode, callback) {
  const nowMs = Date.now();
  if ((actionDebounceUntil[actionKey] || 0) > nowMs) {
    return;
  }

  actionDebounceUntil[actionKey] = nowMs + CONFIG.actionDebounceMs;
  if (buttonNode) {
    buttonNode.disabled = true;
    window.setTimeout(() => {
      buttonNode.disabled = false;
    }, CONFIG.actionDebounceMs);
  }
  callback();
}

function closeSheet() {
  if (state.event.machineState === 'activeEvent') {
    dismissActiveEvent();
    return;
  }
  state.ui.openSheet = null;
  renderSheets();
}

function dismissActiveEvent() {
  if (state.event.machineState !== 'activeEvent') {
    return;
  }

  const penalty = { health: -1, stress: 2, risk: 2 };
  const eventId = state.event.activeEventId;

  applyChoiceEffects(penalty);
  state.event.lastChoiceId = '__dismiss__';
  state.lastChoiceId = '__dismiss__';
  state.event.machineState = 'resolved';

  addLog('choice', `Ereignis geschlossen ohne Auswahl: ${eventId}`, {
    choiceId: '__dismiss__',
    effects: penalty
  });

  runEventStateMachine(state.sim.nowMs);
  state.ui.openSheet = null;
  renderAll();
  schedulePersistState(true);
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    schedulePersistState(true);
  }
}

function addLog(type, message, details) {
  const timestamp = Date.now();
  const payload = details || null;
  const entry = {
    id: `${timestamp}-${state.sim.tickCount}-${state.historyLog.length}`,
    atMs: timestamp,
    t: timestamp,
    type,
    message,
    msg: message,
    details: payload,
    data: payload
  };

  state.historyLog.push(entry);
  if (state.historyLog.length > MAX_HISTORY_LOG) {
    state.historyLog = state.historyLog.slice(-MAX_HISTORY_LOG);
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
      atSimTimeMs: state.sim.simTimeMs,
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
      atSimTimeMs: state.sim.simTimeMs,
      details: payload || { message }
    });
  }
}

function translateEventState(machineState) {
  switch (machineState) {
    case 'idle':
      return 'inaktiv';
    case 'activeEvent':
      return 'aktives Ereignis';
    case 'resolved':
      return 'aufgeloest';
    case 'cooldown':
      return 'Abklingzeit';
    default:
      return machineState;
  }
}

function formatCountdown(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '00:00';
  }

  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function clampInt(value, min, max) {
  return Math.min(max, Math.max(min, Math.trunc(Number(value) || 0)));
}

function plantAssetPath(stageName) {
  const canonical = `${stageName}.png`;
  const fallback = STAGE_ASSET_FALLBACK[stageName];
  return appPath(`assets/plant/${fallback || canonical}`);
}

function applyBackgroundAsset() {
  const bg = state.ui.selectedBackground === 'bg_dark_02.jpg'
    ? appPath('assets/backgrounds/bg_dark_02.jpg')
    : appPath('assets/backgrounds/bg_dark_01.jpg');

  document.body.style.backgroundImage = `linear-gradient(135deg, rgba(7, 10, 17, 0.93) 0%, rgba(9, 14, 24, 0.88) 100%), url('${bg}')`;
}

async function createStorageAdapter() {
  if (typeof indexedDB === 'undefined') {
    return localStorageAdapter();
  }

  try {
    const db = await openDb();
    return {
      async get() {
        return dbGet(db, DB_KEY);
      },
      async set(snapshot) {
        await dbSet(db, DB_KEY, snapshot);
      }
    };
  } catch (_error) {
    return localStorageAdapter();
  }
}

function localStorageAdapter() {
  return {
    async get() {
      const raw = localStorage.getItem(LS_STATE_KEY);
      if (!raw) {
        return null;
      }
      try {
        return JSON.parse(raw);
      } catch (_error) {
        return null;
      }
    },
    async set(snapshot) {
      localStorage.setItem(LS_STATE_KEY, JSON.stringify(snapshot));
    }
  };
}

async function restoreState() {
  if (!storageAdapter) {
    return;
  }

  const saved = await storageAdapter.get();
  if (!saved || typeof saved !== 'object') {
    return;
  }

  if (saved.sim && typeof saved.sim === 'object') {
    Object.assign(state.sim, saved.sim);
  }
  if (saved.growth && typeof saved.growth === 'object') {
    Object.assign(state.growth, saved.growth);
  }
  if (saved.status && typeof saved.status === 'object') {
    Object.assign(state.status, saved.status);
  }
  if (saved.boost && typeof saved.boost === 'object') {
    Object.assign(state.boost, saved.boost);
  }
  if (saved.event && typeof saved.event === 'object') {
    Object.assign(state.event, saved.event);
  }
  if (saved.actions && typeof saved.actions === 'object') {
    Object.assign(state.actions, saved.actions);
  }
  if (saved.ui && typeof saved.ui === 'object') {
    Object.assign(state.ui, saved.ui);
  }
  if (saved.events && typeof saved.events === 'object') {
    state.events = {
      ...state.events,
      ...saved.events,
      scheduler: {
        ...(state.events.scheduler || {}),
        ...((saved.events && saved.events.scheduler) || {})
      }
    };
  }
  if (saved.history && typeof saved.history === 'object') {
    state.history = {
      ...state.history,
      ...saved.history
    };
  }
  if (saved.setup && typeof saved.setup === 'object') {
    state.setup = { ...saved.setup };
  }
  if (Array.isArray(saved.historyLog)) {
    state.historyLog = saved.historyLog.slice(-MAX_HISTORY_LOG);
  }
}

async function persistState() {
  if (!storageAdapter) {
    return;
  }

  try {
    await storageAdapter.set(state);
  } catch (_error) {
    // Persistence failure is non-fatal for runtime behavior.
  }
}

function schedulePersistState(immediate = false) {
  if (immediate) {
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    persistState();
    return;
  }

  if (persistTimer !== null) {
    return;
  }

  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistState();
  }, PERSIST_THROTTLE_MS);
}

function migrateState() {
  try {
    if (!state || typeof state !== 'object') {
      throw new Error('state object missing');
    }

    if (!state.setup || typeof state.setup !== 'object') {
      state.setup = null;
    }

    if (!state.history || typeof state.history !== 'object') {
      state.history = { actions: [], events: [], system: [] };
    }

    if (!state.events || typeof state.events !== 'object') {
      state.events = {};
    }

    if (!state.plant || typeof state.plant !== 'object') {
      state.plant = {};
    }

    if (!state.simulation || typeof state.simulation !== 'object') {
      state.simulation = {};
    }

    if (!state.debug || typeof state.debug !== 'object') {
      state.debug = { enabled: false, showInternalTicks: false, forceDaytime: false };
    }
  } catch (error) {
    console.warn('State migration fallback to defaults', error);
    resetStateToDefaults();
  }
}

function resetStateToDefaults() {
  const fallbackNow = Date.now();
  state.schemaVersion = '1.0.0';
  state.seed = SIM_GLOBAL_SEED;
  state.plantId = SIM_PLANT_ID;
  state.setup = null;
  state.history = { actions: [], events: [], system: [] };
  state.debug = { enabled: false, showInternalTicks: false, forceDaytime: false };
  state.sim.nowMs = fallbackNow;
  state.sim.simTimeMs = alignToSimStartHour(fallbackNow, SIM_START_HOUR);
  state.sim.simEpochMs = state.sim.simTimeMs;
  state.sim.lastTickAtMs = fallbackNow;
}

function ensureStateIntegrity(nowMs) {
  if (typeof state.schemaVersion !== 'string') {
    state.schemaVersion = '1.0.0';
  }

  state.sim.mode = MODE;
  state.sim.tickIntervalMs = UI_TICK_INTERVAL_MS;
  state.sim.timeCompression = SIM_TIME_COMPRESSION;
  state.sim.globalSeed = SIM_GLOBAL_SEED;
  state.sim.plantId = SIM_PLANT_ID;

  if (!Number.isFinite(state.sim.nowMs)) {
    state.sim.nowMs = nowMs;
  }
  if (!Number.isFinite(state.sim.simTimeMs)) {
    state.sim.simTimeMs = alignToSimStartHour(nowMs, SIM_START_HOUR);
  }
  if (!Number.isFinite(state.sim.simEpochMs)) {
    state.sim.simEpochMs = alignToSimStartHour(nowMs, SIM_START_HOUR);
  }
  if (!Number.isFinite(state.sim.lastTickAtMs)) {
    state.sim.lastTickAtMs = nowMs;
  }
  if (!Number.isFinite(state.sim.tickCount)) {
    state.sim.tickCount = 0;
  }
  if (!Number.isFinite(state.sim.lastPushScheduleAtMs)) {
    state.sim.lastPushScheduleAtMs = 0;
  }
  state.sim.isDaytime = isDaytimeAtSimTime(state.sim.simTimeMs);

  const validPhases = new Set(['seedling', 'vegetative', 'flowering', 'harvest']);
  if (!validPhases.has(state.growth.phase) && state.growth.phase !== 'dead') {
    state.growth.phase = 'seedling';
  }

  if (state.growth.phase !== 'dead') {
    state.growth.stageIndex = clampInt(state.growth.stageIndex, 0, STAGE_DEFS.length - 1);
    state.growth.stageProgress = clamp(state.growth.stageProgress, 0, 1);
    state.growth.stageName = stageAssetKeyForIndex(state.growth.stageIndex);
    state.growth.lastValidStageName = state.growth.stageName;
    state.growth.phase = STAGE_DEFS[state.growth.stageIndex].phase;
  } else {
    state.growth.stageName = state.growth.lastValidStageName || 'stage_01';
  }

  if (!Number.isFinite(state.growth.averageHealth)) {
    state.growth.averageHealth = state.status.health;
  }
  if (!Number.isFinite(state.growth.averageStress)) {
    state.growth.averageStress = state.status.stress;
  }
  if (!Number.isFinite(state.growth.observedSimMs)) {
    state.growth.observedSimMs = 0;
  }
  if (typeof state.growth.qualityTier !== 'string') {
    state.growth.qualityTier = 'normal';
  }
  if (typeof state.growth.qualityLocked !== 'boolean') {
    state.growth.qualityLocked = false;
  }

  clampStatus();
  state.status.growth = round2(computeGrowthPercent());

  state.boost.boostMaxPerDay = 6;
  if (!Number.isFinite(state.boost.boostUsedToday)) {
    state.boost.boostUsedToday = 0;
  }
  state.boost.boostUsedToday = clampInt(state.boost.boostUsedToday, 0, state.boost.boostMaxPerDay);
  if (typeof state.boost.dayStamp !== 'string' || !state.boost.dayStamp) {
    state.boost.dayStamp = dayStamp(nowMs);
  }

  const machineStates = new Set(['idle', 'activeEvent', 'resolved', 'cooldown']);
  if (!machineStates.has(state.event.machineState)) {
    state.event.machineState = 'idle';
  }
  if (!Number.isFinite(state.event.nextEventAtMs)) {
    state.event.nextEventAtMs = nowMs + deterministicEventDelayMs(nowMs);
  }
  if (!Number.isFinite(state.event.cooldownUntilMs)) {
    state.event.cooldownUntilMs = 0;
  }
  if (!Array.isArray(state.event.activeOptions)) {
    state.event.activeOptions = [];
  }
  if (!Array.isArray(state.event.activeTags)) {
    state.event.activeTags = [];
  }
  if (!Array.isArray(state.event.catalog)) {
    state.event.catalog = [];
  }

  if (!Array.isArray(state.actions.catalog)) {
    state.actions.catalog = [];
  }
  if (!state.actions.byId || typeof state.actions.byId !== 'object') {
    state.actions.byId = {};
  }
  if (!state.actions.cooldowns || typeof state.actions.cooldowns !== 'object') {
    state.actions.cooldowns = {};
  }
  if (!Array.isArray(state.actions.activeEffects)) {
    state.actions.activeEffects = [];
  }

  state.actions.catalog = state.actions.catalog.map(normalizeAction).filter(Boolean);
  state.actions.byId = Object.fromEntries(state.actions.catalog.map((action) => [action.id, action]));

  for (const [actionId, untilMs] of Object.entries(state.actions.cooldowns)) {
    if (!Number.isFinite(Number(untilMs)) || Number(untilMs) <= nowMs) {
      delete state.actions.cooldowns[actionId];
    }
  }

  state.actions.activeEffects = state.actions.activeEffects
    .filter((effect) => effect && Number.isFinite(Number(effect.remainingSimMs)) && Number(effect.remainingSimMs) > 0)
    .map((effect) => ({
      id: String(effect.id || `${effect.actionId || 'action'}:${nowMs}`),
      actionId: String(effect.actionId || ''),
      remainingSimMs: Math.max(0, Number(effect.remainingSimMs)),
      rates: effect.rates && typeof effect.rates === 'object' ? effect.rates : {}
    }));

  if (!state.actions.lastResult || typeof state.actions.lastResult !== 'object') {
    state.actions.lastResult = { ok: true, reason: 'ok', actionId: null, atRealTimeMs: nowMs };
  }

  if (!state.setup || typeof state.setup !== 'object') {
    state.setup = null;
  }

  if (!state.events || typeof state.events !== 'object') {
    state.events = { scheduler: {}, active: null, history: [] };
  }
  if (!state.events.scheduler || typeof state.events.scheduler !== 'object') {
    state.events.scheduler = {};
  }
  if (!state.events.scheduler.eventCooldowns || typeof state.events.scheduler.eventCooldowns !== 'object') {
    state.events.scheduler.eventCooldowns = {};
  }
  for (const [eventId, untilMs] of Object.entries(state.events.scheduler.eventCooldowns)) {
    if (!Number.isFinite(Number(untilMs)) || Number(untilMs) <= nowMs) {
      delete state.events.scheduler.eventCooldowns[eventId];
    }
  }
  if (!Array.isArray(state.events.history)) {
    state.events.history = [];
  }

  if (!state.history || typeof state.history !== 'object') {
    state.history = { actions: [], events: [], system: [] };
  }
  if (!Array.isArray(state.history.events)) {
    state.history.events = [];
  }

  const validSheets = new Set([null, 'care', 'event', 'dashboard', 'diagnosis']);
  if (!validSheets.has(state.ui.openSheet)) {
    state.ui.openSheet = null;
  }
  if (!Array.isArray(state.ui.visibleOverlayIds)) {
    state.ui.visibleOverlayIds = [];
  }
  if (!state.ui.care || typeof state.ui.care !== 'object') {
    state.ui.care = { selectedCategory: null, feedback: { kind: 'info', text: 'Bereit.' } };
  }
  if (typeof state.ui.care.selectedCategory !== 'string') {
    state.ui.care.selectedCategory = null;
  }
  if (!state.ui.care.feedback || typeof state.ui.care.feedback !== 'object') {
    state.ui.care.feedback = { kind: 'info', text: 'Bereit.' };
  }

  if (typeof state.lastEventId !== 'string') {
    state.lastEventId = null;
  }
  if (typeof state.lastChoiceId !== 'string') {
    state.lastChoiceId = null;
  }
}

function syncCanonicalStateShape() {
  state.seed = state.sim.globalSeed;
  state.plantId = state.sim.plantId;
  state.simulation = {
    startRealTimeMs: state.sim.simEpochMs,
    lastTickRealTimeMs: state.sim.lastTickAtMs,
    simTimeMs: state.sim.simTimeMs,
    simDay: Math.floor(simDayFloat()),
    simHour: simHour(state.sim.simTimeMs),
    simMinute: new Date(state.sim.simTimeMs).getMinutes(),
    timeCompression: state.sim.timeCompression,
    dayWindow: { startHour: SIM_DAY_START_HOUR, endHour: SIM_NIGHT_START_HOUR },
    isDaytime: state.sim.isDaytime
  };

  state.plant = {
    stageIndex: state.growth.stageIndex + 1,
    stageKey: state.growth.stageName,
    stageStartSimDay: STAGE_DEFS[state.growth.stageIndex]?.simDayStart || 0,
    lifecycle: {
      totalSimDays: TOTAL_LIFECYCLE_SIM_DAYS,
      qualityTier: state.growth.qualityTier,
      qualityScore: round2(state.growth.averageHealth - (state.growth.averageStress * 0.5))
    },
    assets: {
      basePath: 'assets/plant/',
      resolvedStagePath: plantAssetPath(state.growth.stageName)
    }
  };

  const existingScheduler = (state.events && state.events.scheduler) ? state.events.scheduler : {};
  state.events = {
    scheduler: {
      nextEventRealTimeMs: state.event.nextEventAtMs,
      lastEventRealTimeMs: state.event.lastEventAtMs,
      lastEventId: state.lastEventId,
      lastEventCategory: existingScheduler.lastEventCategory || state.event.activeCategory || null,
      deferredUntilDaytime: !state.sim.isDaytime,
      windowRealMinutes: { min: 30, max: 90 },
      eventCooldowns: existingScheduler.eventCooldowns || {}
    },
    active: state.event.machineState === 'activeEvent'
      ? {
        id: state.event.activeEventId,
        title: state.event.activeEventTitle,
        description: state.event.activeEventText,
        category: state.event.activeCategory || 'generic'
      }
      : null,
    history: Array.isArray(state.events && state.events.history) ? state.events.history : []
  };

  state.history = state.history || { actions: [], events: [], system: [] };
  if (!Array.isArray(state.history.events)) {
    state.history.events = [];
  }
}

function syncRuntimeClocks(nowMs) {
  state.sim.nowMs = nowMs;
  if (!Number.isFinite(state.sim.simTimeMs)) {
    state.sim.simTimeMs = alignToSimStartHour(nowMs, SIM_START_HOUR);
  }
  state.sim.isDaytime = isDaytimeAtSimTime(state.sim.simTimeMs);
  state.sim.lastTickAtMs = nowMs;
}

async function loadEventCatalog() {
  const catalogs = [];

  try {
    const v1 = await fetch(`./data/events.json?v=${EVENTS_CATALOG_VERSION}`, { cache: 'no-store' });
    if (v1.ok) {
      const payload = await v1.json();
      const events = Array.isArray(payload) ? payload : payload.events;
      if (Array.isArray(events)) {
        catalogs.push(...events.map((eventDef) => normalizeEvent(eventDef, 'v1')).filter(Boolean));
      }
    }
  } catch (_error) {
    // handled by fallback below
  }

  try {
    const v2 = await fetch('./data/events.v2.json', { cache: 'default' });
    if (v2.ok) {
      const payload = await v2.json();
      const events = Array.isArray(payload) ? payload : payload.events;
      if (Array.isArray(events)) {
        catalogs.push(...events.map((eventDef) => normalizeEvent(eventDef, 'v2')).filter(Boolean));
      }
    }
  } catch (_error) {
    // optional catalog, keep working with v1/fallback
  }

  if (!catalogs.length) {
    catalogs.push(normalizeEvent({
      id: 'fallback_soil_check',
      category: 'water',
      title: 'Bodenfeuchte pruefen',
      description: 'Bei der manuellen Kontrolle wurde ungleichmaessige Feuchte festgestellt.',
      choices: [
        { id: 'fallback_care', label: 'Ausgewogene Pflege anwenden', effects: { water: 6, stress: -2, health: 2 } },
        { id: 'fallback_wait', label: 'Einen Zyklus warten', effects: { stress: 2, risk: 2 } },
        { id: 'fallback_mix', label: 'Obere Schicht vorsichtig auflockern', effects: { health: 1, risk: -1 } }
      ]
    }, 'v1'));

    addLog('system', 'events.json/events.v2.json konnten nicht geladen werden, Fallback-Katalog aktiv', null);
  }

  state.event.catalog = catalogs.filter(Boolean);
}

async function loadActionsCatalog() {
  try {
    let response = null;
    try {
      response = await fetch(`./data/actions.json?v=${ACTIONS_CATALOG_VERSION}`, { cache: 'no-store' });
    } catch (_error) {
      response = await fetch('./data/actions.json', { cache: 'default' });
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const actions = Array.isArray(payload) ? payload : payload.actions;
    if (!Array.isArray(actions)) {
      throw new Error('Invalid actions payload');
    }

    const normalized = actions.map(normalizeAction).filter(Boolean);
    state.actions.catalog = normalized;
    state.actions.byId = Object.fromEntries(normalized.map((action) => [action.id, action]));
  } catch (error) {
    state.actions.catalog = [];
    state.actions.byId = {};
    addLog('system', 'actions.json konnte nicht geladen werden, Aktionssystem ohne Katalog', {
      error: error.message
    });
  }
}

function normalizeAction(rawAction) {
  if (!rawAction || typeof rawAction !== 'object' || !rawAction.id) {
    return null;
  }

  const base = {
    id: String(rawAction.id),
    category: String(rawAction.category || 'generic'),
    intensity: String(rawAction.intensity || 'medium'),
    label: String(rawAction.label || rawAction.id),
    trigger: rawAction.trigger && typeof rawAction.trigger === 'object' ? rawAction.trigger : {},
    prerequisites: rawAction.prerequisites && typeof rawAction.prerequisites === 'object' ? rawAction.prerequisites : {},
    effects: rawAction.effects && typeof rawAction.effects === 'object' ? rawAction.effects : {},
    cooldownRealMinutes: clamp(rawAction.cooldownRealMinutes, 0, 24 * 60),
    sideEffects: Array.isArray(rawAction.sideEffects) ? rawAction.sideEffects : []
  };

  base.effects.immediate = base.effects.immediate && typeof base.effects.immediate === 'object' ? base.effects.immediate : {};
  base.effects.overTime = base.effects.overTime && typeof base.effects.overTime === 'object' ? base.effects.overTime : {};
  base.effects.durationSimMinutes = clamp(base.effects.durationSimMinutes, 0, 24 * 60);

  return base;
}

function normalizeEvent(rawEvent, sourceVersion = 'v1') {
  if (!rawEvent || typeof rawEvent !== 'object') {
    return null;
  }
  if (!rawEvent.id || !rawEvent.title || !rawEvent.description) {
    return null;
  }

  const rawOptions = Array.isArray(rawEvent.options)
    ? rawEvent.options
    : (Array.isArray(rawEvent.choices) ? rawEvent.choices : []);

  const options = rawOptions
    .slice(0, 3)
    .map((option) => ({
      id: String(option.id || ''),
      label: String(option.label || 'Option'),
      effects: option.effects && typeof option.effects === 'object' ? option.effects : {},
      sideEffects: Array.isArray(option.sideEffects) ? option.sideEffects : [],
      followUps: Array.isArray(option.followUps)
        ? option.followUps.map(String)
        : (option.followUp ? [String(option.followUp)] : []),
      uiCopy: option.uiCopy && typeof option.uiCopy === 'object' ? option.uiCopy : {}
    }))
    .filter((option) => Boolean(option.id));

  if (!options.length) {
    return null;
  }

  const category = String(rawEvent.category || inferCategoryFromTags(rawEvent.tags || []));

  return {
    id: String(rawEvent.id),
    category,
    title: String(rawEvent.title),
    description: String(rawEvent.description),
    triggers: rawEvent.triggers && typeof rawEvent.triggers === 'object' ? rawEvent.triggers : {},
    weight: Math.max(0.01, Number(rawEvent.weight) || normalizeSeverity(rawEvent.severity) || 1),
    cooldownRealMinutes: clamp(Number(rawEvent.cooldownRealMinutes) || 120, 10, 24 * 60),
    learningNote: String(rawEvent.learningNote || ''),
    severity: normalizeSeverity(rawEvent.severity),
    tags: Array.isArray(rawEvent.tags) ? rawEvent.tags.map(String) : [],
    options,
    sourceVersion
  };
}

function inferCategoryFromTags(tags) {
  const t = Array.isArray(tags) ? tags.map((x) => String(x).toLowerCase()) : [];
  if (t.some((x) => x.includes('water') || x.includes('soil'))) return 'water';
  if (t.some((x) => x.includes('nutri') || x.includes('n'))) return 'nutrition';
  if (t.some((x) => x.includes('pest'))) return 'pest';
  if (t.some((x) => x.includes('mold') || x.includes('disease'))) return 'disease';
  if (t.some((x) => x.includes('train'))) return 'training';
  if (t.some((x) => x.includes('env') || x.includes('heat') || x.includes('cold'))) return 'environment';
  return 'generic';
}

function syncActiveEventFromCatalog() {
  if (state.event.machineState !== 'activeEvent' || !state.event.activeEventId) {
    return;
  }

  const eventDef = state.event.catalog.find((eventItem) => eventItem.id === state.event.activeEventId);
  if (!eventDef) {
    return;
  }

  state.event.activeEventTitle = eventDef.title;
  state.event.activeEventText = eventDef.description;
  state.event.activeLearningNote = eventDef.learningNote || '';
  state.event.activeSeverity = eventDef.severity;
  state.event.activeCooldownRealMinutes = eventDef.cooldownRealMinutes || 120;
  state.event.activeCategory = eventDef.category || 'generic';
  state.event.activeTags = Array.isArray(eventDef.tags) ? eventDef.tags.slice(0, 5) : [];

  const byOptionId = new Map(eventDef.options.map((option) => [option.id, option]));
  const currentIds = Array.isArray(state.event.activeOptions)
    ? state.event.activeOptions.map((option) => option.id)
    : [];

  const localizedOptions = [];
  for (const optionId of currentIds) {
    const localizedOption = byOptionId.get(optionId);
    if (localizedOption) {
      localizedOptions.push({
        id: localizedOption.id,
        label: localizedOption.label,
        effects: { ...(localizedOption.effects || {}) },
        sideEffects: Array.isArray(localizedOption.sideEffects) ? localizedOption.sideEffects : [],
        followUps: Array.isArray(localizedOption.followUps) ? localizedOption.followUps : []
      });
    }
  }

  if (!localizedOptions.length) {
    for (const option of eventDef.options.slice(0, 3)) {
      localizedOptions.push({
        id: option.id,
        label: option.label,
        effects: { ...(option.effects || {}) },
        sideEffects: Array.isArray(option.sideEffects) ? option.sideEffects : [],
        followUps: Array.isArray(option.followUps) ? option.followUps : []
      });
    }
  }

  state.event.activeOptions = localizedOptions.slice(0, 3);
}

function normalizeSeverity(rawSeverity) {
  if (Number.isFinite(rawSeverity)) {
    return clampInt(rawSeverity, 1, 5);
  }

  if (typeof rawSeverity === 'string') {
    const lowered = rawSeverity.trim().toLowerCase();
    if (lowered === 'low') {
      return 2;
    }
    if (lowered === 'medium') {
      return 3;
    }
    if (lowered === 'high') {
      return 4;
    }
    const asNumber = Number(lowered);
    if (Number.isFinite(asNumber)) {
      return clampInt(asNumber, 1, 5);
    }
  }

  return 3;
}

function selectEventDeterministically(catalog, nowMs) {
  if (!Array.isArray(catalog) || !catalog.length) {
    return null;
  }

  let candidates = catalog.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const lastCategory = state.events.scheduler.lastEventCategory || null;

  if (lastCategory) {
    const alt = candidates.filter((item) => item.category !== lastCategory);
    if (alt.length) {
      candidates = alt;
    }
  }

  const weighted = candidates.map((item) => ({
    item,
    weight: Math.max(0.01, Number(item.weight) || 1)
  }));

  const totalWeight = weighted.reduce((sum, row) => sum + row.weight, 0);
  if (totalWeight <= 0) {
    return candidates[0];
  }

  const simDay = Math.floor(simDayFloat());
  const signature = candidates.map((item) => item.id).join('|');
  const purpose = `event_pick:${simDay}:${Math.floor(nowMs / EVENT_ROLL_MIN_REAL_MS)}:${signature}`;
  const u = deterministicUnitFloat(purpose);
  let cursor = u * totalWeight;

  for (const row of weighted) {
    cursor -= row.weight;
    if (cursor <= 0) {
      addLog('event_pick', 'Deterministische Eventauswahl', {
        seed: state.seed,
        plantId: state.plantId,
        simDay,
        purpose,
        pickedId: row.item.id,
        pickedCategory: row.item.category,
        eligibleCount: candidates.length
      });
      return row.item;
    }
  }

  return weighted[weighted.length - 1].item;
}

function scheduleNextEventRoll(nowMs, reason) {
  let nextAt = nowMs + deterministicEventDelayMs(nowMs);
  if (!state.sim.isDaytime) {
    nextAt = nextDaytimeRealMs(nowMs, state.sim.simTimeMs);
  }
  state.event.nextEventAtMs = nextAt;

  addLog('event_roll', 'Naechster Ereigniswurf geplant', {
    reason,
    nextEventAtMs: nextAt,
    simDaytime: state.sim.isDaytime
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register('./sw.js');
  } catch (_error) {
    // SW registration failures should not block app usage.
  }
}

async function onPushSubscribe() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    addLog('system', 'Push wird in diesem Browser nicht unterstuetzt', null);
    renderLogList();
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    addLog('system', `Benachrichtigungsberechtigung: ${permission}`, null);

    if (permission !== 'granted') {
      renderLogList();
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToU8(VAPID_PUBLIC_KEY)
      });
    }

    localStorage.setItem(PUSH_SUB_KEY, JSON.stringify(subscription.toJSON()));

    // TODO: Replace stub call when backend is implemented.
    await postJsonStub(appPath('api/push/subscribe'), {
      createdAt: Date.now(),
      subscription: subscription.toJSON()
    });

    addLog('system', 'Push-Abonnement gespeichert und an Stub-Endpunkt gesendet', null);
    await schedulePushIfAllowed(true);
    renderLogList();
    schedulePersistState(true);
  } catch (error) {
    addLog('system', `Push-Abonnement fehlgeschlagen: ${error.message}`, null);
    renderLogList();
  }
}

async function schedulePushIfAllowed(force) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return;
  }

  const subRaw = localStorage.getItem(PUSH_SUB_KEY);
  if (!subRaw) {
    return;
  }

  if (!force && state.sim.lastPushScheduleAtMs === state.event.nextEventAtMs) {
    return;
  }

  state.sim.lastPushScheduleAtMs = state.event.nextEventAtMs;

  let subscriptionPayload = null;
  try {
    subscriptionPayload = JSON.parse(subRaw);
  } catch (_error) {
    return;
  }

  // TODO: Replace stub call when backend is implemented.
  await postJsonStub(appPath('api/push/schedule'), {
    nextEventAt: state.event.nextEventAtMs,
    cooldownUntil: state.event.cooldownUntilMs,
    subscription: subscriptionPayload
  });
}

async function postJsonStub(url, payload) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    addLog('system', `Stub-Endpunkt fehlgeschlagen: ${url}`, { error: error.message });
  }
}

function base64ToU8(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const normalized = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function dbGet(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const store = tx.objectStore(DB_STORE);
    const request = store.get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

function dbSet(db, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const request = store.put(value, key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
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
