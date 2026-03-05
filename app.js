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
const FREEZE_SIM_ON_DEATH = true; // Für Klarheit: Simulation pausiert nach Tod der Pflanze.

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
  Object.freeze({ index: 0, id: 'germination', label: 'Keimung', simDayStart: 0, phase: 'seedling', minHealth: 30, maxStress: 85 }),
  Object.freeze({ index: 1, id: 'seedling', label: 'Keimling', simDayStart: 2, phase: 'seedling', minHealth: 35, maxStress: 80 }),
  Object.freeze({ index: 2, id: 'early_vegetative', label: 'Frühe Vegetationsphase', simDayStart: 5, phase: 'vegetative', minHealth: 40, maxStress: 75 }),
  Object.freeze({ index: 3, id: 'vegetative', label: 'Vegetationsphase', simDayStart: 10, phase: 'vegetative', minHealth: 42, maxStress: 72 }),
  Object.freeze({ index: 4, id: 'late_vegetative', label: 'Späte Vegetationsphase', simDayStart: 15, phase: 'vegetative', minHealth: 45, maxStress: 70 }),
  Object.freeze({ index: 5, id: 'pre_flower', label: 'Vorblüte', simDayStart: 20, phase: 'vegetative', minHealth: 48, maxStress: 65 }),
  Object.freeze({ index: 6, id: 'stretch', label: 'Streckphase', simDayStart: 25, phase: 'flowering', minHealth: 50, maxStress: 60 }),
  Object.freeze({ index: 7, id: 'early_flower', label: 'Frühe Blüte', simDayStart: 30, phase: 'flowering', minHealth: 52, maxStress: 58 }),
  Object.freeze({ index: 8, id: 'flower', label: 'Blüte', simDayStart: 36, phase: 'flowering', minHealth: 54, maxStress: 55 }),
  Object.freeze({ index: 9, id: 'late_flower', label: 'Späte Blüte', simDayStart: 42, phase: 'flowering', minHealth: 55, maxStress: 52 }),
  Object.freeze({ index: 10, id: 'ripening', label: 'Reife', simDayStart: 48, phase: 'harvest', minHealth: 56, maxStress: 50 }),
  Object.freeze({ index: 11, id: 'harvest_ready', label: 'Erntereif', simDayStart: 54, phase: 'harvest', minHealth: 0, maxStress: 100 })
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
    startRealTimeMs: initialSimTimeMs,
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
    stageIndex: 1,
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
      eventCooldowns: {}
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
let persistTimer = null;
let rescueAdPending = false;
let wasCriticalHealth = false;

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
      mode: state.simulation.mode,
      events: state.events.catalog.length,
      actions: state.actions.catalog.length
    });

    window.__applyAction = (id) => applyAction(id);
    window.__devSelfTest = () => runDevSelfTest();

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
  tickHandle = setInterval(tick, state.simulation.tickIntervalMs);
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
  banner.textContent = `Startfehler: ${error.message}`;
  document.body.appendChild(banner);
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
  ui.analysisTabOverview = document.getElementById('analysisTabOverview');
  ui.analysisTabDiagnosis = document.getElementById('analysisTabDiagnosis');
  ui.analysisTabTimeline = document.getElementById('analysisTabTimeline');
  ui.analysisPanelOverview = document.getElementById('analysisPanelOverview');
  ui.analysisPanelDiagnosis = document.getElementById('analysisPanelDiagnosis');
  ui.analysisPanelTimeline = document.getElementById('analysisPanelTimeline');
  ui.analysisResetBtn = document.getElementById('analysisResetBtn');
  ui.pushToggleBtn = document.getElementById('pushToggleBtn');
  ui.pushToggleStatus = document.getElementById('pushToggleStatus');

  ui.landing = document.getElementById('landing');
  ui.startRunBtn = document.getElementById('startRunBtn');
  ui.setupMode = document.getElementById('setupMode');
  ui.setupLight = document.getElementById('setupLight');
  ui.setupMedium = document.getElementById('setupMedium');
  ui.setupPotSize = document.getElementById('setupPotSize');
  ui.setupGenetics = document.getElementById('setupGenetics');

  ui.deathOverlay = document.getElementById('deathOverlay');
  ui.deathDriverList = document.getElementById('deathDriverList');
  ui.deathHistoryList = document.getElementById('deathHistoryList');
  ui.deathResetBtn = document.getElementById('deathResetBtn');
  ui.deathAnalyzeBtn = document.getElementById('deathAnalyzeBtn');
  ui.deathRescueBtn = document.getElementById('deathRescueBtn');
  ui.deathRescueSubtext = document.getElementById('deathRescueSubtext');
  ui.deathRescueFeedback = document.getElementById('deathRescueFeedback');
}

function bindUi() {
  ui.careActionBtn.addEventListener('click', () => withDebouncedAction('care', ui.careActionBtn, () => openSheet('care')));
  ui.analyzeActionBtn.addEventListener('click', () => withDebouncedAction('analyze', ui.analyzeActionBtn, () => openSheet('dashboard')));
  ui.boostActionBtn.addEventListener('click', () => withDebouncedAction('boost', ui.boostActionBtn, onBoostAction));
  ui.openDiagnosisBtn.addEventListener('click', () => openSheet('diagnosis'));
  ui.startRunBtn.addEventListener('click', onStartRun);
  ui.analysisResetBtn.addEventListener('click', onAnalysisResetClick);
  ui.pushToggleBtn.addEventListener('click', onPushToggleClick);
  ui.deathResetBtn.addEventListener('click', onDeathResetClick);
  ui.deathAnalyzeBtn.addEventListener('click', onDeathAnalyzeClick);
  ui.backdrop.addEventListener('click', closeSheet);

  const analysisTabs = [ui.analysisTabOverview, ui.analysisTabDiagnosis, ui.analysisTabTimeline].filter(Boolean);
  if (!analysisTabs.length) {
    warnMissingUiOnce('analysisTabs');
  }
  for (const tab of analysisTabs) {
    tab.addEventListener('click', () => {
      state.ui.analysis.activeTab = tab.dataset.analysisTab || 'overview';
      renderAnalysisPanel(true);
    });
  }

  const closeButtons = document.querySelectorAll('[data-close-sheet]');
  for (const button of closeButtons) {
    button.addEventListener('click', closeSheet);
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
}

function tick() {
  const nowMs = Date.now();
  const prevOpenSheet = state.ui.openSheet;
  const prevTickRealTimeMs = Number(state.simulation.lastTickRealTimeMs) || nowMs;

  state.simulation.nowMs = nowMs;
  state.simulation.tickCount += 1;

  if (syncDeathState() && FREEZE_SIM_ON_DEATH) {
    state.simulation.lastTickRealTimeMs = nowMs;
    state.simulation.growthImpulse = 0;
    syncCanonicalStateShape();

    if (state.ui.openSheet !== prevOpenSheet) {
      renderSheets();
    }

    renderHud();
    renderEventSheet();
    renderAnalysisPanel();
    renderDeathOverlay();
    schedulePersistState();
    return;
  }

  const elapsedRealMs = clamp(nowMs - prevTickRealTimeMs, 0, MAX_ELAPSED_PER_TICK_MS);
  const elapsedSimMs = elapsedRealMs * state.simulation.timeCompression;

  state.simulation.simTimeMs += elapsedSimMs;
  state.simulation.isDaytime = isDaytimeAtSimTime(state.simulation.simTimeMs);
  state.simulation.lastTickRealTimeMs = nowMs;

  applyStatusDrift(elapsedRealMs);
  const criticalNow = Number(state.status.health) < 20;
  if (criticalNow && !wasCriticalHealth) {
    notifyPlantNeedsCare('Deine Pflanze ist kritisch und braucht Pflege.');
  }
  wasCriticalHealth = criticalNow;
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
  renderAnalysisPanel();
  renderDeathOverlay();
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
    'analysisTabOverview', 'analysisTabDiagnosis', 'analysisTabTimeline', 'analysisPanelOverview', 'analysisPanelDiagnosis', 'analysisPanelTimeline',
    'analysisResetBtn', 'pushToggleBtn', 'pushToggleStatus',
    'landing', 'startRunBtn', 'setupMode', 'setupLight', 'setupMedium', 'setupPotSize', 'setupGenetics',
    'deathOverlay', 'deathDriverList', 'deathHistoryList', 'deathResetBtn', 'deathAnalyzeBtn'
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
    state.simulation.growthImpulse = 0;
    return;
  }

  state.status.water -= 0.33 * minutes;
  state.status.nutrition -= 0.16 * minutes;

  const inRecoveryBand = (
    state.status.water >= 45 && state.status.water <= 72 &&
    state.status.nutrition >= 45 && state.status.nutrition <= 72 &&
    state.status.stress < 42
  );

  let stressDelta = 0.06 * minutes;
  if (inRecoveryBand) {
    stressDelta -= 0.26 * minutes;
  }
  if (state.status.water < 30) {
    stressDelta += 0.42 * minutes;
  }
  if (state.status.nutrition < 30) {
    stressDelta += 0.32 * minutes;
  }
  state.status.stress += stressDelta;

  let riskDelta = 0.05 * minutes + ((state.status.stress / 100) * 0.22 * minutes);
  if (inRecoveryBand) {
    riskDelta -= 0.14 * minutes;
  }
  if (state.status.water > 90 || state.status.water < 18) {
    riskDelta += 0.32 * minutes;
  }
  state.status.risk += riskDelta;

  let healthDelta = (-0.02 * minutes) - ((state.status.stress / 100) * 0.44 * minutes) - ((state.status.risk / 100) * 0.30 * minutes);
  if (inRecoveryBand && state.status.risk <= 45) {
    healthDelta += 0.36 * minutes;
  }
  state.status.health += healthDelta;

  const impulseRaw = (state.status.health - state.status.stress - (state.status.risk * 0.45)) / 35;
  state.simulation.growthImpulse = clamp(impulseRaw, -3, 3);

  clampStatus();
}

function advanceGrowthTick(elapsedSimMs) {
  if (isPlantDead()) {
    state.plant.isDead = true;
    state.plant.stageProgress = 1;
    return;
  }

  if (state.status.health <= 0 || state.status.risk >= 100 || state.plant.isDead === true) {
    enterDeadPhase();
    return;
  }

  updateLifecycleAverages(elapsedSimMs);
  updateQualityTier();

  const simDay = simDayFloat();
  const nextStageIndex = state.plant.stageIndex + 1;

  if (nextStageIndex < STAGE_DEFS.length && canAdvanceToStage(nextStageIndex, simDay)) {
    setGrowthStageIndex(nextStageIndex);
  }

  state.plant.stageProgress = computeStageProgress(simDay, state.plant.stageIndex);
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
    if (state.plant.lifecycle.qualityTier === 'perfect') {
      state.plant.lifecycle.qualityLocked = true;
      return dayReady && healthReady && stressReady;
    }
    return dayReady;
  }

  return dayReady && healthReady && stressReady;
}

function setGrowthStageIndex(stageIndex) {
  const safeIndex = clampInt(stageIndex, 0, STAGE_DEFS.length - 1);
  const stageDef = STAGE_DEFS[safeIndex];

  state.plant.stageIndex = safeIndex;
  state.plant.phase = stageDef.phase;
  state.plant.stageKey = stageAssetKeyForIndex(safeIndex);
  state.plant.lastValidStageKey = state.plant.stageKey;

  addLog('stage', `Stufe erreicht: ${safeIndex + 1} ${stageDef.label}`, {
    simDay: round2(simDayFloat()),
    health: round2(state.status.health),
    stress: round2(state.status.stress),
    quality: state.plant.lifecycle.qualityTier
  });
}

function enterDeadPhase() {
  const wasDead = state.plant.phase === 'dead' || state.plant.isDead === true;
  state.plant.phase = 'dead';
  state.plant.isDead = true;
  state.plant.stageProgress = 1;
  state.plant.stageKey = state.plant.lastValidStageKey || 'stage_01';
  state.ui.deathOverlayOpen = true;
  state.ui.deathOverlayAcknowledged = false;
  if (!wasDead) {
    addLog('system', 'Todesphase erreicht', { stageName: state.plant.stageKey });
  }
}

function isPlantDead() {
  return state.plant.phase === 'dead' || state.plant.isDead === true || Number(state.status.health) <= 0;
}

function syncDeathState() {
  if (!isPlantDead()) {
    state.plant.isDead = false;
    return false;
  }

  if (state.plant.phase !== 'dead' || state.plant.isDead !== true) {
    enterDeadPhase();
  }

  const inAnalysis = state.ui.openSheet === 'dashboard';
  if (!inAnalysis) {
    state.ui.deathOverlayOpen = true;
    state.ui.deathOverlayAcknowledged = false;
  }
  return true;
}

function computeGrowthPercent() {
  if (state.plant.phase === 'dead') {
    return 0;
  }
  const stageUnit = state.plant.stageIndex + state.plant.stageProgress;
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

  const totalObserved = state.plant.observedSimMs + observed;
  state.plant.averageHealth = ((state.plant.averageHealth * state.plant.observedSimMs) + (state.status.health * observed)) / totalObserved;
  state.plant.averageStress = ((state.plant.averageStress * state.plant.observedSimMs) + (state.status.stress * observed)) / totalObserved;
  state.plant.observedSimMs = totalObserved;
}

function updateQualityTier() {
  const avgHealth = state.plant.averageHealth;
  const avgStress = state.plant.averageStress;

  if (avgHealth >= 80 && avgStress <= 30 && state.status.stress <= 30) {
    state.plant.lifecycle.qualityTier = 'perfect';
    return;
  }

  if (avgHealth < 50 || avgStress >= 50 || state.status.stress >= 65) {
    state.plant.lifecycle.qualityTier = 'degraded';
    return;
  }

  state.plant.lifecycle.qualityTier = 'normal';
}

function simDayFloat() {
  const elapsed = Math.max(0, state.simulation.simTimeMs - state.simulation.simEpochMs);
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

function normalizeStageKey(rawStageKey) {
  const raw = String(rawStageKey || '').trim();
  if (raw && Object.prototype.hasOwnProperty.call(STAGE_ASSET_FALLBACK, raw)) {
    return raw;
  }

  const match = raw.match(/^stage_(\d{1,2})$/);
  if (match) {
    const index = clampInt(Number(match[1]), 1, STAGE_DEFS.length);
    return `stage_${String(index).padStart(2, '0')}`;
  }

  return 'stage_01';
}

function runEventStateMachine(nowMs) {
  if (state.events.machineState === 'resolved') {
    enterEventCooldown(nowMs);
  }

  if (state.events.machineState === 'cooldown') {
    if (nowMs >= state.events.cooldownUntilMs) {
      state.events.machineState = 'idle';
      addLog('system', 'Abklingzeit beendet, Status wieder inaktiv', null);
    }
    if (nowMs >= state.events.scheduler.nextEventRealTimeMs) {
      scheduleNextEventRoll(nowMs, 'cooldown');
      schedulePushIfAllowed(false);
    }
  }

  if (state.events.machineState === 'activeEvent' && nowMs >= state.events.scheduler.nextEventRealTimeMs) {
    scheduleNextEventRoll(nowMs, 'active_event_pending');
    schedulePushIfAllowed(false);
  }

  if (state.events.machineState === 'idle' && nowMs >= state.events.scheduler.nextEventRealTimeMs) {
    if (!state.simulation.isDaytime) {
      state.events.scheduler.nextEventRealTimeMs = nextDaytimeRealMs(nowMs, state.simulation.simTimeMs);
      addLog('event_roll', 'Nachtphase: Ereigniswurf auf Tagesbeginn verschoben', {
        nextEventAtMs: state.events.scheduler.nextEventRealTimeMs
      });
      schedulePushIfAllowed(false);
      return;
    }

    const roll = deterministicRoll();
    const trigger = shouldTriggerEvent(roll);

    addLog('event_roll', trigger ? 'Ereigniswurf erfolgreich' : 'Ereigniswurf nicht erfolgreich', {
      roll,
      threshold: eventThreshold(),
      simHour: simHour(state.simulation.simTimeMs),
      at: nowMs
    });

    if (trigger) {
      activateEvent(nowMs);
    }

    scheduleNextEventRoll(nowMs, 'post_roll');
    schedulePushIfAllowed(false);
  }

  if (state.events.machineState === 'activeEvent') {
    state.ui.openSheet = 'event';
  }
}

function activateEvent(nowMs) {
  const catalog = state.events.catalog;
  if (!Array.isArray(catalog) || !catalog.length) {
    return;
  }

  const eligible = eligibleEventsForNow(nowMs);
  if (!eligible.length) {
    addLog('event_roll', 'Keine passenden Ereignisse für aktuellen Zustand', {
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

  state.events.machineState = 'activeEvent';
  state.events.activeEventId = eventDef.id;
  state.events.scheduler.lastEventId = eventDef.id;
  state.events.activeEventTitle = eventDef.title;
  state.events.activeEventText = eventDef.description;
  state.events.activeLearningNote = eventDef.learningNote || '';
  state.events.activeOptions = options;
  state.events.activeSeverity = eventDef.severity || 3;
  state.events.activeCooldownRealMinutes = clamp(Number(eventDef.cooldownRealMinutes) || 120, 10, 24 * 60);
  state.events.activeCategory = eventDef.category || 'generic';
  state.events.activeTags = Array.isArray(eventDef.tags) ? eventDef.tags.slice(0, 5) : [];
  state.events.scheduler.lastEventRealTimeMs = nowMs;

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

  addLog('event_shown', `Ereignis ausgewählt: ${eventDef.id}`, {
    title: eventDef.title,
    severity: state.events.activeSeverity,
    category: eventDef.category || 'generic'
  });

  notifyPlantNeedsCare('Deine Pflanze braucht Pflege.');
}

function eligibleEventsForNow(nowMs) {
  const cooldowns = state.events.scheduler.eventCooldowns || {};
  return state.events.catalog
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
    const stageIndex = state.plant.stageIndex + 1;
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
    return state.plant.stageIndex + 1;
  }
  if (fieldPath === 'plant.stageKey') {
    return state.plant.stageKey;
  }
  if (fieldPath.startsWith('setup.')) {
    return (state.setup || {})[fieldPath.split('.')[1]];
  }
  if (fieldPath === 'simulation.isDaytime') {
    return state.simulation.isDaytime;
  }

  return undefined;
}

function onEventOptionClick(optionId) {
  if (isPlantDead()) {
    return;
  }
  if (state.events.machineState !== 'activeEvent') {
    return;
  }

  const choice = state.events.activeOptions.find((option) => option.id === optionId);
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
    const roll = deterministicUnitFloat(`event_side:${state.events.activeEventId}:${choice.id}:${side.id || 'side'}:${state.simulation.tickCount}`);
    if (roll <= chance) {
      applyChoiceEffects(side.effects || {});
      triggeredSideEffects.push(side.id || 'side');
    }
  }

  const after = snapshotStatus();
  const deltaSummary = summarizeDelta(before, after);

  state.events.lastChoiceId = choice.id;
  state.events.scheduler.lastChoiceId = choice.id;
  state.events.machineState = 'resolved';

  const triggerSnapshot = {
    simDay: Math.floor(simDayFloat()),
    stageIndex: state.plant.stageIndex + 1,
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
    eventId: state.events.activeEventId,
    category: state.events.activeCategory || 'generic',
    optionId: choice.id,
    optionLabel: choice.label,
    learningNote: state.events.activeLearningNote || '',
    triggerSnapshot,
    effectsApplied: deltaSummary,
    sideEffectsTriggered: triggeredSideEffects,
    atSimTimeMs: state.simulation.simTimeMs,
    atRealTimeMs: Date.now()
  };

  state.history.events.push(historyEntry);
  state.events.history.push(historyEntry);

  addLog('choice', `Option gewählt: ${state.events.activeEventId}/${choice.id}`, {
    effects: choice.effects || {},
    sideEffects: triggeredSideEffects,
    effectsApplied: deltaSummary,
    followUps: choice.followUps || []
  });

  runEventStateMachine(state.simulation.nowMs);
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
  if (state.plant.phase === 'dead') {
    return;
  }

  const units = clamp((percent / 100) * STAGE_DEFS.length, 0, STAGE_DEFS.length);
  const stageIndex = Math.min(STAGE_DEFS.length - 1, Math.floor(units));
  setGrowthStageIndex(stageIndex);
  state.plant.stageProgress = clamp(units - stageIndex, 0, 1);
}

function enterEventCooldown(nowMs) {
  const activeEventId = state.events.activeEventId;
  const perEventCooldownMs = Math.round((Number(state.events.activeCooldownRealMinutes) || 120) * 60 * 1000);

  state.events.machineState = 'cooldown';
  state.events.cooldownUntilMs = nowMs + cooldownMs();
  state.events.activeEventId = null;
  state.events.activeEventTitle = '';
  state.events.activeEventText = '';
  state.events.activeOptions = [];
  state.events.activeSeverity = 1;
  state.events.activeCooldownRealMinutes = 120;
  state.events.activeCategory = 'generic';
  state.events.activeTags = [];

  if (activeEventId) {
    state.events.scheduler.eventCooldowns[activeEventId] = nowMs + perEventCooldownMs;
  }
  state.events.active = null;

  addLog('system', 'Ereignis abgeschlossen, Abklingzeit gestartet', {
    cooldownUntilMs: state.events.cooldownUntilMs,
    eventId: activeEventId,
    perEventCooldownMs
  });
}

function deterministicRoll() {
  const bucket = Math.floor(state.events.scheduler.nextEventRealTimeMs / EVENT_ROLL_MIN_REAL_MS);
  const riskBucket = Math.round(state.status.risk / 5);
  return deterministicUnitFloat(`roll:${bucket}:${riskBucket}:${state.simulation.tickCount}`);
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
  if (isPlantDead()) {
    const nowMs = Date.now();
    state.actions.lastResult = { ok: false, reason: 'dead_run_ended', actionId, atRealTimeMs: nowMs };
    return { ok: false, reason: 'dead_run_ended' };
  }

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
    const roll = deterministicUnitFloat(`action_side:${action.id}:${side.id || 'side'}:${state.simulation.tickCount}:${Math.floor(state.simulation.simTimeMs / 60000)}`);
    if (roll <= chance) {
      applyEffectsObject(side.deltas || {});
      triggeredSideEffects.push(side.id || 'side_effect');
    }
  }

  const cooldownMs = Math.round((Number(action.cooldownRealMinutes) || 0) * 60 * 1000);
  state.actions.cooldowns[action.id] = nowMs + cooldownMs;

  const after = snapshotStatus();
  const deltaSummary = summarizeDelta(before, after);

  addLog('action', `Aktion: ${action.label}`, {
    type: 'action',
    id: action.id,
    category: action.category,
    intensity: action.intensity,
    label: action.label,
    simTime: state.simulation.simTimeMs,
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
  if (trigger.timeWindow === 'daytime_only' && !state.simulation.isDaytime) {
    return { ok: false, reason: 'outside_time_window:daytime_only' };
  }

  if (Number.isFinite(trigger.minStageIndex) && state.plant.stageIndex < Number(trigger.minStageIndex)) {
    return { ok: false, reason: `stage_too_low:${state.plant.stageIndex}<${trigger.minStageIndex}` };
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
    id: `${action.id}:${nowMs}:${state.simulation.tickCount}`,
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
  if (isPlantDead()) {
    addLog('action', 'Boost blockiert: Pflanze ist eingegangen', null);
    renderAll();
    return;
  }

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

  state.events.scheduler.nextEventRealTimeMs = Math.max(nowMs, state.events.scheduler.nextEventRealTimeMs - BOOST_ADVANCE_MS);
  state.events.cooldownUntilMs = Math.max(nowMs, state.events.cooldownUntilMs - BOOST_ADVANCE_MS);

  runEventStateMachine(nowMs);
  updateVisibleOverlays();

  addLog('action', '+30-Minuten-Boost angewendet', {
    usedToday: state.boost.boostUsedToday,
    nextEventAtMs: state.events.scheduler.nextEventRealTimeMs
  });

  renderAll();
  schedulePersistState(true);
}

function onClearLog() {
  state.history.systemLog = [];
  state.history = { actions: [], events: [], system: [] };
  addLog('system', 'Protokoll geleert', null);
  renderAnalysisPanel(true);
  schedulePersistState(true);
}

function resetBoostDaily(nowMs) {
  const currentStamp = dayStamp(nowMs);
  if (state.boost.dayStamp !== currentStamp) {
    state.boost.dayStamp = currentStamp;
    state.boost.boostUsedToday = 0;
    addLog('system', 'Täglicher Boost-Zähler zurückgesetzt', { dayStamp: currentStamp });
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
  const realDeltaMs = Math.ceil(simDeltaMs / state.simulation.timeCompression);
  return realNowMs + realDeltaMs;
}

function formatSimClock(simTimeMs) {
  return new Date(simTimeMs).toLocaleTimeString('de-DE');
}

function deterministicUnitFloat(contextKey) {
  const hash = hashString(`${state.simulation.globalSeed}|${state.simulation.plantId}|${contextKey}`);
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
  syncDeathState();
  renderHud();
  renderSheets();
  renderCareSheet();
  renderEventSheet();
  renderAnalysisPanel(true);
  renderLanding();
  renderDeathOverlay();
}

function renderHud() {
  const dead = isPlantDead();
  const phaseLabel = PHASE_LABEL_DE[state.plant.phase] || PHASE_LABEL_DE.seedling;
  const dayNight = state.simulation.isDaytime ? 'Tag' : 'Nacht';
  const statusText = `Phase: ${phaseLabel} · ${dayNight}`;
  const boostText = `Werbeunterstützt · ${state.boost.boostUsedToday}/${state.boost.boostMaxPerDay} heute`;

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

  if (ui.plantImage && ui.plantImage.dataset.stageName !== state.plant.stageKey) {
    ui.plantImage.src = plantAssetPath(state.plant.stageKey);
    ui.plantImage.dataset.stageName = state.plant.stageKey;
  }

  const eventInMs = state.events.scheduler.nextEventRealTimeMs - state.simulation.nowMs;
  ui.nextEventValue.textContent = formatCountdown(eventInMs);
  ui.growthImpulseValue.textContent = state.simulation.growthImpulse.toFixed(2);
  ui.simTimeValue.textContent = formatSimClock(state.simulation.simTimeMs);

  ui.careActionBtn.disabled = dead;
  ui.boostActionBtn.disabled = dead;
  ui.openDiagnosisBtn.disabled = dead;

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
    watering: 'Bewässerung',
    fertilizing: 'Düngung',
    training: 'Training',
    environment: 'Umgebung'
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
      setCareFeedback('info', `${labels[category] || category} ausgewählt.`);
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
      ? `Abklingzeit ${Math.ceil(cooldownLeft / 60000)}m`
      : `Abklingzeit ${Math.round(action.cooldownRealMinutes || 0)}m`;

    button.innerHTML = `<div><strong>${action.label}</strong><div class="care-action-meta">${labelForIntensity(action.intensity)}</div></div><span class="care-action-meta">${cooldownText}</span>`;

    button.addEventListener('click', () => {
      const result = applyAction(action.id);
      if (result.ok) {
        setCareFeedback('success', `${action.label} ausgeführt.`);
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
  if (intensity === 'low') return 'Niedrig';
  if (intensity === 'high') return 'Hoch';
  return 'Mittel';
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
    return `Aktion blockiert: ${value.replace('cooldown_active:', 'Abklingzeit noch ')}`;
  }
  if (value.startsWith('prereq_min_failed:') || value.startsWith('prereq_max_failed:')) {
    return `Voraussetzung nicht erfüllt (${value.split(':')[1] || 'unbekannt'}).`;
  }
  if (value.startsWith('outside_time_window:')) {
    return 'Aktion nur tagsüber verfügbar.';
  }
  if (value.startsWith('stage_too_low:')) {
    return 'Aktion für diese Phase noch nicht freigeschaltet.';
  }
  if (value === 'dead_run_ended') {
    return 'Aktion nicht möglich: Die Pflanze ist eingegangen.';
  }
  return `Aktion blockiert (${value}).`;
}

function renderEventSheet() {
  if (state.ui.openSheet !== 'event' && state.events.machineState !== 'activeEvent') {
    return;
  }

  ui.eventStateBadge.textContent = `Status: ${translateEventState(state.events.machineState)}`;

  if (state.events.machineState === 'activeEvent') {
    ui.eventTitle.textContent = state.events.activeEventTitle;
    ui.eventText.textContent = state.events.activeEventText;
    ui.eventMeta.textContent = `Schweregrad: ${state.events.activeSeverity} | Stichwörter: ${state.events.activeTags.join(', ') || '-'}`;

    const optionSignature = `${state.events.activeEventId}|${state.events.activeOptions.map((option) => `${option.id}:${option.label}`).join('|')}`;
    if (ui.eventOptionList.dataset.signature !== optionSignature) {
      ui.eventOptionList.dataset.signature = optionSignature;
      ui.eventOptionList.replaceChildren();
      for (const option of state.events.activeOptions) {
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

  if (state.events.machineState === 'cooldown') {
    const cooldownLeft = state.events.cooldownUntilMs - state.simulation.nowMs;
    ui.eventTitle.textContent = 'Abklingzeit aktiv';
    ui.eventText.textContent = 'Das Ereignissystem befindet sich in der Abklingzeit.';
    ui.eventMeta.textContent = `Abklingzeit: ${formatCountdown(cooldownLeft)}`;
  } else {
    ui.eventTitle.textContent = 'Kein aktives Ereignis';
    ui.eventText.textContent = 'Ein Ereignis erscheint, sobald der nächste Wurf erfolgreich ist.';
    ui.eventMeta.textContent = `Nächster Wurf: ${formatCountdown(state.events.scheduler.nextEventRealTimeMs - state.simulation.nowMs)}`;
  }

  if (ui.eventOptionList.childElementCount > 0) {
    ui.eventOptionList.dataset.signature = '';
    ui.eventOptionList.replaceChildren();
  }
}

function warnMissingUiOnce(key) {
  if (warnedUiKeys.has(key)) {
    return;
  }
  warnedUiKeys.add(key);
  console.warn(`Missing analysis UI element: ${key}`);
}

function renderAnalysisPanel(force = false) {
  if (!force && state.ui.openSheet !== 'dashboard') {
    return;
  }

  if (!ui.analysisTabOverview || !ui.analysisTabDiagnosis || !ui.analysisTabTimeline || !ui.analysisPanelOverview || !ui.analysisPanelDiagnosis || !ui.analysisPanelTimeline) {
    warnMissingUiOnce('analysis-panel');
    return;
  }

  renderPushToggle();

  const activeTab = (state.ui.analysis && state.ui.analysis.activeTab) ? state.ui.analysis.activeTab : 'overview';
  const tabMap = {
    overview: ui.analysisPanelOverview,
    diagnosis: ui.analysisPanelDiagnosis,
    timeline: ui.analysisPanelTimeline
  };

  ui.analysisTabOverview.classList.toggle('is-active', activeTab === 'overview');
  ui.analysisTabDiagnosis.classList.toggle('is-active', activeTab === 'diagnosis');
  ui.analysisTabTimeline.classList.toggle('is-active', activeTab === 'timeline');

  for (const [tabId, panel] of Object.entries(tabMap)) {
    panel.classList.toggle('hidden', tabId !== activeTab);
  }

  renderAnalysisOverview();
  renderAnalysisDiagnosis();
  renderAnalysisTimeline();
}

function renderPushToggle() {
  if (!ui.pushToggleBtn || !ui.pushToggleStatus) {
    return;
  }

  const enabled = Boolean(state.settings && state.settings.pushNotificationsEnabled === true);
  ui.pushToggleBtn.textContent = enabled ? 'AN' : 'AUS';
  ui.pushToggleBtn.setAttribute('aria-pressed', String(enabled));
  ui.pushToggleStatus.textContent = enabled
    ? 'Push-Benachrichtigungen aktiv'
    : 'Push-Benachrichtigungen deaktiviert';
}

function renderAnalysisOverview() {
  if (!ui.analysisPanelOverview) {
    warnMissingUiOnce('analysisPanelOverview');
    return;
  }

  const stageIndex = Number(state.plant && state.plant.stageIndex) || 1;
  const stageDef = STAGE_DEFS[clampInt(stageIndex, 0, STAGE_DEFS.length - 1)];
  const stageDisplay = clampInt(stageIndex + 1, 1, STAGE_DEFS.length);
  const stageLabel = stageDef ? stageDef.label : '-';
  const qualityTier = (state.plant && state.plant.lifecycle && state.plant.lifecycle.qualityTier) || 'normal';
  const dayNight = (state.simulation && state.simulation.isDaytime) ? 'Tag' : 'Nacht';
  const simDay = Number(state.simulation && state.simulation.simDay) || 0;
  const status = state.status || {};
  const qualityTierText = qualityTierLabel(qualityTier);

  ui.analysisPanelOverview.innerHTML = `
    <div class="gs-analysis-metric"><strong>Stufe ${stageDisplay}: ${stageLabel}</strong><br>Qualität: ${escapeHtml(String(qualityTierText))}</div>
    <div class="gs-analysis-metric"><strong>${dayNight}</strong><br>Sim-Tag ${simDay}</div>
    <div class="gs-analysis-metric-grid">
      <div class="gs-analysis-metric">Wasser<br><strong>${round2(Number(status.water) || 0)}</strong></div>
      <div class="gs-analysis-metric">Nährstoffe<br><strong>${round2(Number(status.nutrition) || 0)}</strong></div>
      <div class="gs-analysis-metric">Gesundheit<br><strong>${round2(Number(status.health) || 0)}</strong></div>
      <div class="gs-analysis-metric">Stress<br><strong>${round2(Number(status.stress) || 0)}</strong></div>
      <div class="gs-analysis-metric">Risiko<br><strong>${round2(Number(status.risk) || 0)}</strong></div>
      <div class="gs-analysis-metric">Wachstum<br><strong>${round2(Number(status.growth) || 0)}</strong></div>
    </div>
  `;
}

function renderAnalysisDiagnosis() {
  if (!ui.analysisPanelDiagnosis) {
    warnMissingUiOnce('analysisPanelDiagnosis');
    return;
  }

  const drivers = diagnosisDrivers();
  const top = drivers.slice(0, 3);
  const recommendation = recommendedCareCategory(top[0]);
  const recommendationLabel = categoryLabel(recommendation);

  ui.analysisPanelDiagnosis.replaceChildren();

  for (const item of top) {
    const node = document.createElement('div');
    node.className = 'gs-analysis-driver';
    node.innerHTML = `<strong>${escapeHtml(item.label)}</strong><br>${escapeHtml(item.reason)}`;
    ui.analysisPanelDiagnosis.appendChild(node);
  }

  const rec = document.createElement('div');
  rec.className = 'gs-analysis-driver';
  rec.innerHTML = `<strong>Empfohlene nächste Pflege:</strong> ${escapeHtml(recommendationLabel)}`;
  ui.analysisPanelDiagnosis.appendChild(rec);
}

function diagnosisDrivers() {
  const d = [];
  const s = state.status || {};
  const stageIndex = Number(state.plant && state.plant.stageIndex) || 1;

  if ((Number(s.water) || 0) < 35) d.push({ score: 100 - s.water, label: 'Wassermangel', reason: 'Zu trocken erhöht den Stress' });
  if ((Number(s.water) || 0) > 80) d.push({ score: s.water, label: 'Überwässerung', reason: 'Zu viel Wasser erhöht das Risiko' });
  if ((Number(s.nutrition) || 0) < 35) d.push({ score: 95 - s.nutrition, label: 'Nährstoffmangel', reason: 'Unterversorgung bremst das Wachstum' });
  if ((Number(s.nutrition) || 0) > 80) d.push({ score: s.nutrition, label: 'Nährstoffüberschuss', reason: 'Erhöhtes Risiko für Nährstoffbrand' });
  if ((Number(s.stress) || 0) > 60) d.push({ score: s.stress + 10, label: 'Hoher Stress', reason: 'Hoher Stress blockiert das beste Ergebnis' });
  if ((Number(s.risk) || 0) > 60) d.push({ score: s.risk + 8, label: 'Hohes Risiko', reason: 'Hohes Risiko erhöht negative Ereignisse' });

  if (stageIndex <= 3 && (Number(s.health) || 0) < 65) {
    d.push({ score: 70 - (Number(s.health) || 0), label: 'Frühe-Phase-Empfindlichkeit', reason: 'Frühe Phasen brauchen stabile Wasser- und Nährstoffwerte' });
  }

  if (!d.length) {
    d.push({ score: 1, label: 'Stabiler Zustand', reason: 'Kein größeres Defizit erkannt' });
  }

  return d.sort((a, b) => b.score - a.score);
}

function recommendedCareCategory(primaryDriver) {
  if (!primaryDriver) return 'environment';
  const map = {
    Wassermangel: 'watering',
    Überwässerung: 'environment',
    Nährstoffmangel: 'fertilizing',
    Nährstoffüberschuss: 'environment',
    'Hoher Stress': 'environment',
    'Hohes Risiko': 'environment',
    'Stabiler Zustand': 'training'
  };
  return map[primaryDriver.label] || 'environment';
}

function qualityTierLabel(tier) {
  if (tier === 'perfect') return 'Perfekt';
  if (tier === 'degraded') return 'Geschwächt';
  return 'Normal';
}

function categoryLabel(category) {
  const map = {
    watering: 'Bewässerung',
    fertilizing: 'Düngung',
    training: 'Training',
    environment: 'Umgebung',
    water: 'Wasser',
    nutrition: 'Nährstoffe',
    pest: 'Schädlinge',
    disease: 'Krankheit',
    generic: 'Allgemein'
  };
  return map[String(category || 'generic')] || String(category || 'Allgemein');
}

function renderAnalysisTimeline() {
  if (!ui.analysisPanelTimeline) {
    warnMissingUiOnce('analysisPanelTimeline');
    return;
  }

  const actions = Array.isArray(state.history && state.history.actions) ? state.history.actions : [];
  const events = Array.isArray(state.history && state.history.events) ? state.history.events : [];
  const system = Array.isArray(state.history && state.history.system) ? state.history.system : [];
  const simNow = Number(state.simulation && state.simulation.simTimeMs) || 0;

  const merged = [];
  for (const item of actions) {
    merged.push({
      kind: 'action',
      atRealTimeMs: Number(item.atRealTimeMs || item.realTime || 0),
      atSimTimeMs: Number(item.atSimTimeMs || item.simTime || simNow),
      data: item
    });
  }
  for (const item of events) {
    merged.push({
      kind: 'event',
      atRealTimeMs: Number(item.atRealTimeMs || item.realTime || 0),
      atSimTimeMs: Number(item.atSimTimeMs || item.simTime || simNow),
      data: item
    });
  }
  for (const item of system) {
    const stamp = item && item.timestamp && typeof item.timestamp === 'object' ? item.timestamp : null;
    merged.push({
      kind: 'system',
      atRealTimeMs: Number(item.atRealTimeMs || (stamp && stamp.realMs) || item.realTime || 0),
      atSimTimeMs: Number(item.atSimTimeMs || (stamp && stamp.simMs) || item.simTime || simNow),
      data: item
    });
  }

  merged.sort((a, b) => (b.atRealTimeMs || b.atSimTimeMs) - (a.atRealTimeMs || a.atSimTimeMs));
  const latest = merged.slice(0, 10);

  ui.analysisPanelTimeline.replaceChildren();

  if (!latest.length) {
    const empty = document.createElement('div');
    empty.className = 'gs-analysis-timeline-item';
    empty.textContent = 'Noch keine Aktivitäten';
    ui.analysisPanelTimeline.appendChild(empty);
    return;
  }

  for (const row of latest) {
    const simStamp = simStampFromMs(row.atSimTimeMs);
    const node = document.createElement('div');
    node.className = 'gs-analysis-timeline-item';

    if (row.kind === 'action') {
      const d = row.data || {};
      node.innerHTML = `<div class="gs-analysis-timeline-meta">${simStamp} · Aktion</div><strong>${escapeHtml(String(d.label || d.id || 'Aktion'))}</strong><br>${formatDeltaSummary(d.deltaSummary || {})}`;
    } else if (row.kind === 'event') {
      const d = row.data || {};
      const note = d.learningNote ? `<details><summary>Lernhinweis</summary>${escapeHtml(String(d.learningNote))}</details>` : '';
      node.innerHTML = `<div class="gs-analysis-timeline-meta">${simStamp} · Ereignis (${escapeHtml(categoryLabel(String(d.category || 'generic')))})</div><strong>${escapeHtml(String(d.optionLabel || d.optionId || d.eventId || 'Ereignis'))}</strong><br>${formatDeltaSummary(d.effectsApplied || d.deltaSummary || {})}${note}`;
    } else {
      const d = row.data || {};
      const typeLabel = String(d.type || 'system');
      const label = d.label || d.id || 'System';
      const wasDeadNote = typeof d.wasDead === 'boolean'
        ? (d.wasDead ? ' · Reanimation' : ' · Stabilisierung')
        : '';
      node.innerHTML = `<div class="gs-analysis-timeline-meta">${simStamp} · System (${escapeHtml(typeLabel === 'rescue' ? 'Notfallrettung' : 'System')})</div><strong>${escapeHtml(String(label))}</strong>${wasDeadNote}<br>${formatDeltaSummary(d.effectsApplied || (d.details && d.details.effectsApplied) || {})}`;
    }

    ui.analysisPanelTimeline.appendChild(node);
  }
}

function simStampFromMs(simMs) {
  const base = Number(state.simulation.startRealTimeMs || simMs || 0);
  const raw = Number(simMs || base);
  const delta = Math.max(0, raw - base);
  const totalDay = Math.floor(delta / (24 * 60 * 60 * 1000));
  const hh = Math.floor((delta % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  return `Tag ${totalDay} · ${String(hh).padStart(2, '0')}:00`;
}

function formatDeltaSummary(delta) {
  const parts = [];
  for (const [k, v] of Object.entries(delta || {})) {
    if (!Number.isFinite(Number(v)) || Number(v) === 0) {
      continue;
    }
    const n = round2(Number(v));
    parts.push(`${k}: ${n > 0 ? '+' : ''}${n}`);
  }
  return parts.length ? parts.join(' · ') : 'Keine Nettoänderung';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function openSheet(name) {
  if (isPlantDead() && name !== 'dashboard') {
    return;
  }
  state.ui.openSheet = name;
  renderSheets();

  if (name === 'dashboard') {
    renderAnalysisPanel(true);
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

function renderDeathOverlay() {
  if (!ui.deathOverlay || !ui.deathDriverList || !ui.deathHistoryList) {
    return;
  }

  const visible = Boolean(state.ui.deathOverlayOpen && isPlantDead());
  ui.deathOverlay.classList.toggle('hidden', !visible);
  ui.deathOverlay.setAttribute('aria-hidden', String(!visible));

  if (!visible) {
    return;
  }

  const topDrivers = diagnosisDrivers().slice(0, 3);
  ui.deathDriverList.replaceChildren();
  for (const item of topDrivers) {
    const row = document.createElement('li');
    row.innerHTML = `<strong>${escapeHtml(String(item.label || 'Unklare Ursache'))}</strong><br>${escapeHtml(String(item.reason || 'Kein Detail verfügbar'))}`;
    ui.deathDriverList.appendChild(row);
  }

  const recent = collectRecentHistoryEntries(3);
  ui.deathHistoryList.replaceChildren();
  if (!recent.length) {
    const empty = document.createElement('li');
    empty.textContent = 'Keine Aktionen oder Ereignisse protokolliert.';
    ui.deathHistoryList.appendChild(empty);
  } else {
    for (const row of recent) {
      const item = document.createElement('li');
      item.innerHTML = formatRecentHistoryHtml(row);
      ui.deathHistoryList.appendChild(item);
    }
  }

  const meta = getCanonicalMeta(state);
  const rescueUsed = Boolean(meta.rescue.used);
  ui.deathRescueBtn.disabled = rescueAdPending || rescueUsed;
  ui.deathRescueBtn.textContent = rescueUsed
    ? 'Notfallrettung bereits verwendet'
    : (rescueAdPending ? 'Werbung läuft…' : 'Notfallrettung (1×) - Werbeunterstützt');
  ui.deathRescueSubtext.textContent = rescueUsed
    ? 'Einmal pro Run verfügbar (bereits genutzt)'
    : 'Einmal pro Run verfügbar';
  ui.deathRescueFeedback.textContent = meta.rescue.lastResult ? String(meta.rescue.lastResult) : '';
}

function collectRecentHistoryEntries(limit = 3) {
  const actions = Array.isArray(state.history && state.history.actions) ? state.history.actions : [];
  const events = Array.isArray(state.history && state.history.events) ? state.history.events : [];
  const merged = [];

  for (const action of actions) {
    merged.push({
      kind: 'action',
      atRealTimeMs: Number(action.atRealTimeMs || action.realTime || 0),
      atSimTimeMs: Number(action.atSimTimeMs || action.simTime || state.simulation.simTimeMs),
      data: action
    });
  }

  for (const eventItem of events) {
    merged.push({
      kind: 'event',
      atRealTimeMs: Number(eventItem.atRealTimeMs || eventItem.realTime || 0),
      atSimTimeMs: Number(eventItem.atSimTimeMs || eventItem.simTime || state.simulation.simTimeMs),
      data: eventItem
    });
  }

  merged.sort((a, b) => (b.atRealTimeMs || b.atSimTimeMs) - (a.atRealTimeMs || a.atSimTimeMs));
  return merged.slice(0, limit);
}

function formatRecentHistoryHtml(row) {
  const simStamp = simStampFromMs(row.atSimTimeMs);
  const data = row.data || {};
  if (row.kind === 'action') {
    const label = escapeHtml(String(data.label || data.id || 'Aktion'));
    return `<span class="timeline-meta">${simStamp} · Aktion</span><br><strong>${label}</strong>`;
  }

  const category = escapeHtml(categoryLabel(data.category || 'generic'));
  const label = escapeHtml(String(data.optionLabel || data.optionId || data.eventId || 'Ereignis'));
  return `<span class="timeline-meta">${simStamp} · Ereignis (${category})</span><br><strong>${label}</strong>`;
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
  addLog('system', 'Einstellungen gespeichert, Durchlauf gestartet', state.setup);
}

async function onDeathResetClick() {
  await resetRun();
}

function onDeathAnalyzeClick() {
  state.ui.deathOverlayOpen = false;
  state.ui.deathOverlayAcknowledged = true;
  openSheet('dashboard');
  renderDeathOverlay();
}

async function onDeathRescueClick() {
  const meta = getCanonicalMeta(state);
  if (rescueAdPending) {
    return;
  }

  if (meta.rescue.used) {
    meta.rescue.lastResult = 'Notfallrettung ist nur einmal pro Run verfügbar.';
    renderDeathOverlay();
    schedulePersistState(true);
    return;
  }

  const beforeHealth = Number(state.status.health) || 0;
  const deadNow = isPlantDead();
  if (!deadNow && beforeHealth >= 20) {
    meta.rescue.lastResult = 'Notfallrettung ist aktuell nicht erforderlich.';
    renderDeathOverlay();
    schedulePersistState(true);
    return;
  }

  rescueAdPending = true;
  meta.rescue.lastResult = 'Werbung läuft…';
  renderDeathOverlay();

  let adResult = { ok: false, reason: 'error' };
  try {
    adResult = await requestRescueAd();
  } catch (_error) {
    adResult = { ok: false, reason: 'error' };
  } finally {
    rescueAdPending = false;
  }

  if (!adResult.ok) {
    meta.rescue.lastResult = 'Werbung nicht abgeschlossen – Rettung nicht ausgelöst.';
    renderDeathOverlay();
    schedulePersistState(true);
    return;
  }

  const rescueResult = applyRescueEffects();
  if (!rescueResult.ok) {
    meta.rescue.lastResult = 'Notfallrettung ist aktuell nicht erforderlich.';
    renderDeathOverlay();
    schedulePersistState(true);
    return;
  }

  const nowMs = Date.now();
  meta.rescue.used = true;
  meta.rescue.usedAtRealMs = nowMs;
  meta.rescue.lastResult = 'Notfallrettung angewendet. Die Pflanze stabilisiert sich.';

  const timestamp = {
    realMs: nowMs,
    simMs: Number(state.simulation.simTimeMs || 0),
    simStamp: simStampFromMs(Number(state.simulation.simTimeMs || 0))
  };
  const history = getCanonicalHistory(state);
  history.system.push({
    type: 'rescue',
    label: 'Notfallrettung',
    effectsApplied: rescueResult.effectsApplied,
    wasDead: rescueResult.wasDead,
    timestamp,
    atRealTimeMs: timestamp.realMs,
    atSimTimeMs: timestamp.simMs
  });
  if (history.system.length > MAX_HISTORY_LOG) {
    history.system = history.system.slice(-MAX_HISTORY_LOG);
  }

  updateVisibleOverlays();
  syncCanonicalStateShape();
  renderAll();
  schedulePersistState(true);
}

async function onPushToggleClick() {
  const currentlyEnabled = Boolean(state.settings && state.settings.pushNotificationsEnabled === true);
  if (currentlyEnabled) {
    state.settings.pushNotificationsEnabled = false;
    renderPushToggle();
    schedulePersistState(true);
    return;
  }

  if (typeof Notification === 'undefined') {
    state.settings.pushNotificationsEnabled = false;
    renderPushToggle();
    schedulePersistState(true);
    return;
  }

  let permission = Notification.permission;
  if (permission !== 'granted') {
    permission = await Notification.requestPermission();
  }

  if (permission === 'granted') {
    state.settings.pushNotificationsEnabled = true;
    await schedulePushIfAllowed(true);
  } else {
    state.settings.pushNotificationsEnabled = false;
  }

  renderPushToggle();
  schedulePersistState(true);
}

async function onAnalysisResetClick() {
  const confirmed = window.confirm('Aktuellen Run wirklich zurücksetzen? Dieser Schritt löscht den gespeicherten Fortschritt.');
  if (!confirmed) {
    return;
  }
  await resetRun();
}

async function resetRun() {
  await clearPersistentStorage();

  resetStateToDefaults();
  ensureStateIntegrity(Date.now());
  syncRuntimeClocks(Date.now());
  syncCanonicalStateShape();
  rescueAdPending = false;
  wasCriticalHealth = false;
  if (state.meta && state.meta.rescue) {
    state.meta.rescue.used = false;
    state.meta.rescue.usedAtRealMs = null;
    state.meta.rescue.lastResult = null;
  }

  state.ui.openSheet = null;
  state.ui.deathOverlayOpen = false;
  state.ui.deathOverlayAcknowledged = false;
  for (const key of Object.keys(actionDebounceUntil)) {
    delete actionDebounceUntil[key];
  }

  renderAll();
  schedulePersistState(true);
}

async function clearPersistentStorage() {
  try {
    localStorage.removeItem(LS_STATE_KEY);
  } catch (_error) {
    // non-fatal
  }
  try {
    localStorage.removeItem(PUSH_SUB_KEY);
  } catch (_error) {
    // non-fatal
  }

  if (typeof indexedDB === 'undefined') {
    return;
  }

  try {
    const db = await openDb();
    await dbDelete(db, DB_KEY);
    db.close();
  } catch (_error) {
    // non-fatal
  }
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
  if (state.events.machineState === 'activeEvent') {
    dismissActiveEvent();
    return;
  }
  state.ui.openSheet = null;
  renderSheets();
}

function dismissActiveEvent() {
  if (state.events.machineState !== 'activeEvent') {
    return;
  }

  const penalty = { health: -1, stress: 2, risk: 2 };
  const eventId = state.events.activeEventId;

  applyChoiceEffects(penalty);
  state.events.lastChoiceId = '__dismiss__';
  state.events.scheduler.lastChoiceId = '__dismiss__';
  state.events.machineState = 'resolved';

  addLog('choice', `Ereignis geschlossen ohne Auswahl: ${eventId}`, {
    choiceId: '__dismiss__',
    effects: penalty
  });

  runEventStateMachine(state.simulation.nowMs);
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

function translateEventState(machineState) {
  switch (machineState) {
    case 'idle':
      return 'inaktiv';
    case 'activeEvent':
      return 'aktives Ereignis';
    case 'resolved':
      return 'aufgelöst';
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
  const safeStageKey = normalizeStageKey(stageName);
  const canonical = `${safeStageKey}.png`;
  const fallback = STAGE_ASSET_FALLBACK[safeStageKey];
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

function getCanonicalSimulation(snapshot) {
  const s = snapshot || state;
  if (!s.simulation || typeof s.simulation !== 'object') {
    s.simulation = {};
  }

  const nowMs = Date.now();
  if (!Number.isFinite(s.simulation.nowMs)) s.simulation.nowMs = nowMs;
  if (!Number.isFinite(s.simulation.startRealTimeMs)) s.simulation.startRealTimeMs = alignToSimStartHour(nowMs, SIM_START_HOUR);
  if (!Number.isFinite(s.simulation.lastTickRealTimeMs)) s.simulation.lastTickRealTimeMs = nowMs;
  if (!Number.isFinite(s.simulation.simTimeMs)) s.simulation.simTimeMs = alignToSimStartHour(nowMs, SIM_START_HOUR);
  if (!Number.isFinite(s.simulation.simEpochMs)) s.simulation.simEpochMs = s.simulation.startRealTimeMs;
  if (!Number.isFinite(s.simulation.simDay)) s.simulation.simDay = 0;
  if (!Number.isFinite(s.simulation.simHour)) s.simulation.simHour = SIM_START_HOUR;
  if (!Number.isFinite(s.simulation.simMinute)) s.simulation.simMinute = 0;
  if (!Number.isFinite(s.simulation.tickCount)) s.simulation.tickCount = 0;
  if (typeof s.simulation.mode !== 'string') s.simulation.mode = MODE;
  if (!Number.isFinite(s.simulation.tickIntervalMs)) s.simulation.tickIntervalMs = UI_TICK_INTERVAL_MS;
  if (!Number.isFinite(s.simulation.timeCompression)) s.simulation.timeCompression = SIM_TIME_COMPRESSION;
  if (typeof s.simulation.globalSeed !== 'string') s.simulation.globalSeed = SIM_GLOBAL_SEED;
  if (typeof s.simulation.plantId !== 'string') s.simulation.plantId = SIM_PLANT_ID;
  if (!s.simulation.dayWindow || typeof s.simulation.dayWindow !== 'object') s.simulation.dayWindow = { startHour: SIM_DAY_START_HOUR, endHour: SIM_NIGHT_START_HOUR };
  if (typeof s.simulation.isDaytime !== 'boolean') s.simulation.isDaytime = isDaytimeAtSimTime(s.simulation.simTimeMs);
  if (!Number.isFinite(s.simulation.growthImpulse)) s.simulation.growthImpulse = 0;
  if (!Number.isFinite(s.simulation.lastPushScheduleAtMs)) s.simulation.lastPushScheduleAtMs = 0;

  return s.simulation;
}

function getCanonicalPlant(snapshot) {
  const s = snapshot || state;
  if (!s.plant || typeof s.plant !== 'object') {
    s.plant = {};
  }

  if (typeof s.plant.phase !== 'string') s.plant.phase = 'seedling';
  if (typeof s.plant.isDead !== 'boolean') s.plant.isDead = false;
  if (!Number.isFinite(s.plant.stageIndex)) s.plant.stageIndex = 1;
  if (typeof s.plant.stageKey !== 'string') s.plant.stageKey = 'stage_01';
  if (!Number.isFinite(s.plant.stageProgress)) s.plant.stageProgress = 0;
  if (!Number.isFinite(s.plant.stageStartSimDay)) s.plant.stageStartSimDay = 0;
  if (typeof s.plant.lastValidStageKey !== 'string') s.plant.lastValidStageKey = 'stage_01';
  if (!Number.isFinite(s.plant.averageHealth)) s.plant.averageHealth = 85;
  if (!Number.isFinite(s.plant.averageStress)) s.plant.averageStress = 15;
  if (!Number.isFinite(s.plant.observedSimMs)) s.plant.observedSimMs = 0;
  if (!s.plant.lifecycle || typeof s.plant.lifecycle !== 'object') {
    s.plant.lifecycle = { totalSimDays: TOTAL_LIFECYCLE_SIM_DAYS, qualityTier: 'normal', qualityScore: 0, qualityLocked: false };
  }
  if (!s.plant.assets || typeof s.plant.assets !== 'object') {
    s.plant.assets = { basePath: 'assets/plant/', resolvedStagePath: '' };
  }

  return s.plant;
}

function getCanonicalEvents(snapshot) {
  const s = snapshot || state;
  if (!s.events || typeof s.events !== 'object') {
    s.events = {};
  }

  if (typeof s.events.machineState !== 'string') s.events.machineState = 'idle';
  if (!s.events.scheduler || typeof s.events.scheduler !== 'object') {
    s.events.scheduler = {
      nextEventRealTimeMs: Date.now() + EVENT_ROLL_MIN_REAL_MS,
      lastEventRealTimeMs: 0,
      lastEventId: null,
      lastChoiceId: null,
      lastEventCategory: null,
      deferredUntilDaytime: false,
      windowRealMinutes: { min: 30, max: 90 },
      eventCooldowns: {}
    };
  }
  if (!s.events.active || typeof s.events.active !== 'object') {
    s.events.active = null;
  }
  if (!Array.isArray(s.events.history)) s.events.history = [];
  if (typeof s.events.activeEventId !== 'string') s.events.activeEventId = null;
  if (typeof s.events.activeEventTitle !== 'string') s.events.activeEventTitle = '';
  if (typeof s.events.activeEventText !== 'string') s.events.activeEventText = '';
  if (typeof s.events.activeLearningNote !== 'string') s.events.activeLearningNote = '';
  if (!Array.isArray(s.events.activeOptions)) s.events.activeOptions = [];
  if (!Number.isFinite(s.events.activeSeverity)) s.events.activeSeverity = 1;
  if (!Number.isFinite(s.events.activeCooldownRealMinutes)) s.events.activeCooldownRealMinutes = 120;
  if (typeof s.events.activeCategory !== 'string') s.events.activeCategory = 'generic';
  if (!Array.isArray(s.events.activeTags)) s.events.activeTags = [];
  if (!Number.isFinite(s.events.lastEventAtMs)) s.events.lastEventAtMs = 0;
  if (!Number.isFinite(s.events.cooldownUntilMs)) s.events.cooldownUntilMs = 0;
  if (!Array.isArray(s.events.catalog)) s.events.catalog = [];

  return s.events;
}

function getCanonicalHistory(snapshot) {
  const s = snapshot || state;
  if (!s.history || typeof s.history !== 'object') {
    s.history = { actions: [], events: [], system: [], systemLog: [] };
  }
  if (!Array.isArray(s.history.actions)) s.history.actions = [];
  if (!Array.isArray(s.history.events)) s.history.events = [];
  if (!Array.isArray(s.history.system)) s.history.system = [];
  if (!Array.isArray(s.history.systemLog)) s.history.systemLog = [];
  return s.history;
}

function getCanonicalMeta(snapshot) {
  const s = snapshot || state;
  if (!s.meta || typeof s.meta !== 'object') {
    s.meta = {};
  }
  if (!s.meta.rescue || typeof s.meta.rescue !== 'object') {
    s.meta.rescue = {};
  }
  if (typeof s.meta.rescue.used !== 'boolean') s.meta.rescue.used = false;
  if (!Number.isFinite(Number(s.meta.rescue.usedAtRealMs))) s.meta.rescue.usedAtRealMs = null;
  if (s.meta.rescue.lastResult !== null && typeof s.meta.rescue.lastResult !== 'string') s.meta.rescue.lastResult = null;
  return s.meta;
}
function getCanonicalSettings(snapshot) {
  const s = snapshot || state;
  if (!s.settings || typeof s.settings !== 'object') {
    s.settings = {};
  }
  s.settings.pushNotificationsEnabled = Boolean(s.settings.pushNotificationsEnabled);
  return s.settings;
}


async function restoreState() {
  if (!storageAdapter) {
    return;
  }

  const saved = await storageAdapter.get();
  if (!saved || typeof saved !== 'object') {
    return;
  }

  const sim = getCanonicalSimulation(state);
  const plant = getCanonicalPlant(state);
  const events = getCanonicalEvents(state);
  const history = getCanonicalHistory(state);
  const meta = getCanonicalMeta(state);
  const settings = getCanonicalSettings(state);

  if (saved.simulation && typeof saved.simulation === 'object') {
    state.simulation = {
      ...state.simulation,
      ...saved.simulation
    };
  }

  if (saved.plant && typeof saved.plant === 'object') {
    state.plant = {
      ...state.plant,
      ...saved.plant
    };
  }

  if (saved.events && typeof saved.events === 'object') {
    state.events = {
      ...state.events,
      ...saved.events,
      scheduler: {
        ...events.scheduler,
        ...((saved.events && saved.events.scheduler) || {})
      }
    };
  }

  if (saved.history && typeof saved.history === 'object') {
    state.history = {
      ...state.history,
      ...saved.history,
      actions: Array.isArray(saved.history.actions) ? saved.history.actions : history.actions,
      events: Array.isArray(saved.history.events) ? saved.history.events : history.events,
      system: Array.isArray(saved.history.system) ? saved.history.system : history.system,
      systemLog: Array.isArray(saved.history.systemLog) ? saved.history.systemLog : history.systemLog
    };
  }

  if (saved.status && typeof saved.status === 'object') {
    Object.assign(state.status, saved.status);
  }
  if (saved.boost && typeof saved.boost === 'object') {
    Object.assign(state.boost, saved.boost);
  }
  if (saved.actions && typeof saved.actions === 'object') {
    Object.assign(state.actions, saved.actions);
  }
  if (saved.ui && typeof saved.ui === 'object') {
    Object.assign(state.ui, saved.ui);
  }
  if (saved.setup && typeof saved.setup === 'object') {
    state.setup = { ...saved.setup };
  }
  if (saved.meta && typeof saved.meta === 'object') {
    state.meta = {
      ...meta,
      ...saved.meta,
      rescue: {
        ...meta.rescue,
        ...((saved.meta && saved.meta.rescue) || {})
      }
    };
  }
  if (saved.settings && typeof saved.settings === 'object') {
    state.settings = {
      ...settings,
      ...saved.settings,
      pushNotificationsEnabled: Boolean(saved.settings.pushNotificationsEnabled)
    };
  }

  migrateLegacyStateIntoCanonical(saved, state);
}

function migrateLegacyStateIntoCanonical(saved, targetState) {
  const sim = getCanonicalSimulation(targetState);
  const plant = getCanonicalPlant(targetState);
  const events = getCanonicalEvents(targetState);
  const history = getCanonicalHistory(targetState);

  if (saved.sim && typeof saved.sim === 'object') {
    targetState.simulation = {
      ...sim,
      ...saved.sim,
      startRealTimeMs: Number(saved.sim.simEpochMs || sim.startRealTimeMs),
      lastTickRealTimeMs: Number(saved.sim.lastTickAtMs || sim.lastTickRealTimeMs),
      simEpochMs: Number(saved.sim.simEpochMs || sim.simEpochMs),
      tickIntervalMs: Number(saved.sim.tickIntervalMs || sim.tickIntervalMs),
      growthImpulse: Number(saved.sim.growthImpulse || sim.growthImpulse),
      lastPushScheduleAtMs: Number(saved.sim.lastPushScheduleAtMs || sim.lastPushScheduleAtMs)
    };
  }

  if (saved.growth && typeof saved.growth === 'object') {
    targetState.plant = {
      ...plant,
      phase: String(saved.growth.phase || plant.phase),
      isDead: Boolean(saved.growth.isDead),
      stageIndex: clampInt(Number(saved.growth.stageIndex || 0) + 1, 1, STAGE_DEFS.length),
      stageKey: String(saved.growth.stageName || plant.stageKey),
      stageProgress: clamp(Number(saved.growth.stageProgress || 0), 0, 1),
      lastValidStageKey: String(saved.growth.lastValidStageName || plant.lastValidStageKey),
      averageHealth: Number(saved.growth.averageHealth || plant.averageHealth),
      averageStress: Number(saved.growth.averageStress || plant.averageStress),
      observedSimMs: Number(saved.growth.observedSimMs || plant.observedSimMs),
      lifecycle: {
        ...plant.lifecycle,
        qualityTier: String(saved.growth.qualityTier || plant.lifecycle.qualityTier),
        qualityLocked: Boolean(saved.growth.qualityLocked)
      }
    };
  }

  if (saved.event && typeof saved.event === 'object') {
    targetState.events = {
      ...events,
      machineState: String(saved.event.machineState || events.machineState),
      activeEventId: saved.event.activeEventId || null,
      activeEventTitle: String(saved.event.activeEventTitle || ''),
      activeEventText: String(saved.event.activeEventText || ''),
      activeLearningNote: String(saved.event.activeLearningNote || ''),
      activeOptions: Array.isArray(saved.event.activeOptions) ? saved.event.activeOptions : [],
      activeSeverity: Number(saved.event.activeSeverity || 1),
      activeCooldownRealMinutes: Number(saved.event.activeCooldownRealMinutes || 120),
      activeCategory: String(saved.event.activeCategory || 'generic'),
      activeTags: Array.isArray(saved.event.activeTags) ? saved.event.activeTags : [],
      lastEventAtMs: Number(saved.event.lastEventAtMs || 0),
      cooldownUntilMs: Number(saved.event.cooldownUntilMs || 0),
      catalog: Array.isArray(saved.event.catalog) ? saved.event.catalog : events.catalog,
      scheduler: {
        ...events.scheduler,
        nextEventRealTimeMs: Number(saved.event.nextEventAtMs || events.scheduler.nextEventRealTimeMs),
        lastEventRealTimeMs: Number(saved.event.lastEventAtMs || events.scheduler.lastEventRealTimeMs),
        lastEventId: typeof saved.event.activeEventId === 'string' ? saved.event.activeEventId : events.scheduler.lastEventId,
        lastChoiceId: typeof saved.event.lastChoiceId === 'string' ? saved.event.lastChoiceId : events.scheduler.lastChoiceId
      }
    };
  }

  if (Array.isArray(saved.historyLog) && !history.system.length) {
    targetState.history.system = saved.historyLog.slice(-MAX_HISTORY_LOG).map((entry) => ({
      type: 'system',
      id: entry.type || 'legacy_log',
      atSimTimeMs: Number(entry.timestamp || targetState.simulation.simTimeMs || 0),
      details: entry
    }));
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
  const fallbackSimStart = alignToSimStartHour(fallbackNow, SIM_START_HOUR);
  const preservedEventCatalog = Array.isArray(state.events && state.events.catalog) ? state.events.catalog.slice() : [];
  const preservedActionCatalog = Array.isArray(state.actions && state.actions.catalog) ? state.actions.catalog.slice() : [];
  const normalizedActions = preservedActionCatalog.map(normalizeAction).filter(Boolean);

  state.schemaVersion = '1.0.0';
  state.seed = SIM_GLOBAL_SEED;
  state.plantId = SIM_PLANT_ID;
  state.setup = null;
  state.settings = {
    pushNotificationsEnabled: false
  };
  state.meta = {
    rescue: {
      used: false,
      usedAtRealMs: null,
      lastResult: null
    }
  };
  state.history = { actions: [], events: [], system: [], systemLog: [] };
  state.debug = { enabled: false, showInternalTicks: false, forceDaytime: false };

  state.simulation = {
    nowMs: fallbackNow,
    startRealTimeMs: fallbackSimStart,
    lastTickRealTimeMs: fallbackNow,
    simTimeMs: fallbackSimStart,
    simEpochMs: fallbackSimStart,
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
    isDaytime: isDaytimeAtSimTime(fallbackSimStart),
    growthImpulse: 0,
    lastPushScheduleAtMs: 0
  };

  state.plant = {
    phase: 'seedling',
    isDead: false,
    stageIndex: 1,
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
  };

  state.events = {
    machineState: 'idle',
    scheduler: {
      nextEventRealTimeMs: fallbackNow + EVENT_ROLL_MIN_REAL_MS,
      lastEventRealTimeMs: 0,
      lastEventId: null,
      lastChoiceId: null,
      lastEventCategory: null,
      deferredUntilDaytime: false,
      windowRealMinutes: { min: 30, max: 90 },
      eventCooldowns: {}
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
    catalog: preservedEventCatalog
  };

  state.status = {
    health: 85,
    stress: 15,
    water: 70,
    nutrition: 65,
    growth: 10,
    risk: 20
  };

  state.boost = {
    boostUsedToday: 0,
    boostMaxPerDay: 6,
    dayStamp: dayStamp(fallbackNow)
  };

  state.event = {
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
    nextEventAtMs: fallbackNow + EVENT_ROLL_MIN_REAL_MS,
    cooldownUntilMs: 0,
    lastChoiceId: null,
    catalog: preservedEventCatalog
  };

  state.actions = {
    catalog: normalizedActions,
    byId: Object.fromEntries(normalizedActions.map((action) => [action.id, action])),
    cooldowns: {},
    activeEffects: [],
    lastResult: { ok: true, reason: 'ok', actionId: null, atRealTimeMs: fallbackNow }
  };

  state.ui = {
    openSheet: null,
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
  };

  state.lastEventId = null;
  state.lastChoiceId = null;
  state.historyLog = [];
}

function ensureStateIntegrity(nowMs) {
  if (typeof state.schemaVersion !== 'string') {
    state.schemaVersion = '1.0.0';
  }

  state.simulation.mode = MODE;
  state.simulation.tickIntervalMs = UI_TICK_INTERVAL_MS;
  state.simulation.timeCompression = SIM_TIME_COMPRESSION;
  state.simulation.globalSeed = SIM_GLOBAL_SEED;
  state.simulation.plantId = SIM_PLANT_ID;

  if (!Number.isFinite(state.simulation.nowMs)) {
    state.simulation.nowMs = nowMs;
  }
  if (!Number.isFinite(state.simulation.simTimeMs)) {
    state.simulation.simTimeMs = alignToSimStartHour(nowMs, SIM_START_HOUR);
  }
  if (!Number.isFinite(state.simulation.simEpochMs)) {
    state.simulation.simEpochMs = alignToSimStartHour(nowMs, SIM_START_HOUR);
  }
  if (!Number.isFinite(state.simulation.lastTickRealTimeMs)) {
    state.simulation.lastTickRealTimeMs = nowMs;
  }
  if (!Number.isFinite(state.simulation.tickCount)) {
    state.simulation.tickCount = 0;
  }
  if (!Number.isFinite(state.simulation.lastPushScheduleAtMs)) {
    state.simulation.lastPushScheduleAtMs = 0;
  }
  state.simulation.isDaytime = isDaytimeAtSimTime(state.simulation.simTimeMs);

  const validPhases = new Set(['seedling', 'vegetative', 'flowering', 'harvest']);
  if (!validPhases.has(state.plant.phase) && state.plant.phase !== 'dead') {
    state.plant.phase = 'seedling';
  }

  state.plant.lastValidStageKey = normalizeStageKey(state.plant.lastValidStageKey);
  const deadByHealth = Number(state.status.health) <= 0;
  const deadRequested = state.plant.phase === 'dead' || state.plant.isDead === true || deadByHealth;
  state.plant.isDead = deadRequested;

  if (!deadRequested) {
    state.plant.stageIndex = clampInt(state.plant.stageIndex, 0, STAGE_DEFS.length - 1);
    state.plant.stageProgress = clamp(state.plant.stageProgress, 0, 1);
    state.plant.stageKey = normalizeStageKey(stageAssetKeyForIndex(state.plant.stageIndex));
    state.plant.lastValidStageKey = state.plant.stageKey;
    state.plant.phase = STAGE_DEFS[state.plant.stageIndex].phase;
  } else {
    state.plant.phase = 'dead';
    state.plant.stageKey = normalizeStageKey(state.plant.lastValidStageKey || 'stage_01');
    state.plant.stageProgress = 1;
  }

  if (!Number.isFinite(state.plant.averageHealth)) {
    state.plant.averageHealth = state.status.health;
  }
  if (!Number.isFinite(state.plant.averageStress)) {
    state.plant.averageStress = state.status.stress;
  }
  if (!Number.isFinite(state.plant.observedSimMs)) {
    state.plant.observedSimMs = 0;
  }
  if (typeof state.plant.lifecycle.qualityTier !== 'string') {
    state.plant.lifecycle.qualityTier = 'normal';
  }
  if (typeof state.plant.lifecycle.qualityLocked !== 'boolean') {
    state.plant.lifecycle.qualityLocked = false;
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
  if (!machineStates.has(state.events.machineState)) {
    state.events.machineState = 'idle';
  }
  if (!Number.isFinite(state.events.scheduler.nextEventRealTimeMs)) {
    state.events.scheduler.nextEventRealTimeMs = nowMs + deterministicEventDelayMs(nowMs);
  }
  if (!Number.isFinite(state.events.cooldownUntilMs)) {
    state.events.cooldownUntilMs = 0;
  }
  if (!Array.isArray(state.events.activeOptions)) {
    state.events.activeOptions = [];
  }
  if (!Array.isArray(state.events.activeTags)) {
    state.events.activeTags = [];
  }
  if (!Array.isArray(state.events.catalog)) {
    state.events.catalog = [];
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

  const meta = getCanonicalMeta(state);
  const settings = getCanonicalSettings(state);
  meta.rescue.used = Boolean(meta.rescue.used);
  meta.rescue.usedAtRealMs = Number.isFinite(Number(meta.rescue.usedAtRealMs)) ? Number(meta.rescue.usedAtRealMs) : null;
  meta.rescue.lastResult = (typeof meta.rescue.lastResult === 'string' || meta.rescue.lastResult === null)
    ? meta.rescue.lastResult
    : null;
  settings.pushNotificationsEnabled = Boolean(settings.pushNotificationsEnabled);

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
  if (!state.ui.analysis || typeof state.ui.analysis !== 'object') {
    state.ui.analysis = { activeTab: 'overview' };
  }
  if (!['overview', 'diagnosis', 'timeline'].includes(state.ui.analysis.activeTab)) {
    state.ui.analysis.activeTab = 'overview';
  }
  if (typeof state.ui.deathOverlayOpen !== 'boolean') {
    state.ui.deathOverlayOpen = false;
  }
  if (typeof state.ui.deathOverlayAcknowledged !== 'boolean') {
    state.ui.deathOverlayAcknowledged = false;
  }

  if (typeof state.events.scheduler.lastEventId !== 'string') {
    state.events.scheduler.lastEventId = null;
  }
  if (typeof state.events.scheduler.lastChoiceId !== 'string') {
    state.events.scheduler.lastChoiceId = null;
  }
}

function syncCanonicalStateShape() {
  const sim = getCanonicalSimulation(state);
  const plant = getCanonicalPlant(state);
  const events = getCanonicalEvents(state);
  const history = getCanonicalHistory(state);
  const meta = getCanonicalMeta(state);
  const settings = getCanonicalSettings(state);

  state.seed = sim.globalSeed;
  state.plantId = sim.plantId;

  sim.simDay = Math.floor(simDayFloat());
  sim.simHour = simHour(sim.simTimeMs);
  sim.simMinute = new Date(sim.simTimeMs).getMinutes();
  sim.dayWindow = { startHour: SIM_DAY_START_HOUR, endHour: SIM_NIGHT_START_HOUR };
  sim.isDaytime = isDaytimeAtSimTime(sim.simTimeMs);

  plant.stageStartSimDay = STAGE_DEFS[Math.max(0, plant.stageIndex - 1)]?.simDayStart || 0;
  plant.lifecycle = {
    ...plant.lifecycle,
    totalSimDays: TOTAL_LIFECYCLE_SIM_DAYS,
    qualityScore: round2(plant.averageHealth - (plant.averageStress * 0.5))
  };
  plant.assets = {
    ...plant.assets,
    basePath: 'assets/plant/',
    resolvedStagePath: plantAssetPath(plant.stageKey)
  };

  events.scheduler = {
    ...events.scheduler,
    nextEventRealTimeMs: Number(events.scheduler.nextEventRealTimeMs || sim.nowMs + EVENT_ROLL_MIN_REAL_MS),
    lastEventRealTimeMs: Number(events.scheduler.lastEventRealTimeMs || 0),
    deferredUntilDaytime: !sim.isDaytime,
    windowRealMinutes: { min: 30, max: 90 },
    eventCooldowns: events.scheduler.eventCooldowns || {}
  };

  events.active = events.machineState === 'activeEvent'
    ? {
      id: events.activeEventId,
      title: events.activeEventTitle,
      description: events.activeEventText,
      category: events.activeCategory || 'generic',
      learningNote: events.activeLearningNote || ''
    }
    : null;

  history.actions = Array.isArray(history.actions) ? history.actions : [];
  history.events = Array.isArray(history.events) ? history.events : [];
  history.system = Array.isArray(history.system) ? history.system : [];
  history.systemLog = Array.isArray(history.systemLog) ? history.systemLog : [];
  meta.rescue.used = Boolean(meta.rescue.used);
  meta.rescue.usedAtRealMs = Number.isFinite(Number(meta.rescue.usedAtRealMs)) ? Number(meta.rescue.usedAtRealMs) : null;
  meta.rescue.lastResult = (typeof meta.rescue.lastResult === 'string' || meta.rescue.lastResult === null)
    ? meta.rescue.lastResult
    : null;
  settings.pushNotificationsEnabled = Boolean(settings.pushNotificationsEnabled);

  syncLegacyMirrorsFromCanonical(state);
}

function syncLegacyMirrorsFromCanonical(snapshot) {
  const s = snapshot;
  const sim = getCanonicalSimulation(s);
  const plant = getCanonicalPlant(s);
  const events = getCanonicalEvents(s);
  const history = getCanonicalHistory(s);

  s.sim = {
    nowMs: sim.nowMs,
    simTimeMs: sim.simTimeMs,
    simEpochMs: sim.simEpochMs,
    tickCount: sim.tickCount,
    mode: sim.mode,
    tickIntervalMs: sim.tickIntervalMs,
    timeCompression: sim.timeCompression,
    globalSeed: sim.globalSeed,
    plantId: sim.plantId,
    isDaytime: sim.isDaytime,
    lastTickAtMs: sim.lastTickRealTimeMs,
    growthImpulse: sim.growthImpulse,
    lastPushScheduleAtMs: sim.lastPushScheduleAtMs
  };

  s.growth = {
    phase: plant.phase,
    isDead: plant.isDead,
    stageIndex: Math.max(0, plant.stageIndex - 1),
    stageName: plant.stageKey,
    stageProgress: plant.stageProgress,
    lastValidStageName: plant.lastValidStageKey,
    averageHealth: plant.averageHealth,
    averageStress: plant.averageStress,
    observedSimMs: plant.observedSimMs,
    qualityTier: plant.lifecycle.qualityTier,
    qualityLocked: Boolean(plant.lifecycle.qualityLocked)
  };

  s.event = {
    machineState: events.machineState,
    activeEventId: events.activeEventId,
    activeEventTitle: events.activeEventTitle,
    activeEventText: events.activeEventText,
    activeLearningNote: events.activeLearningNote,
    activeOptions: events.activeOptions,
    activeSeverity: events.activeSeverity,
    activeCooldownRealMinutes: events.activeCooldownRealMinutes,
    activeCategory: events.activeCategory,
    activeTags: events.activeTags,
    lastEventAtMs: events.lastEventAtMs,
    nextEventAtMs: events.scheduler.nextEventRealTimeMs,
    cooldownUntilMs: events.cooldownUntilMs,
    lastChoiceId: events.scheduler.lastChoiceId,
    catalog: events.catalog
  };

  s.lastEventId = events.scheduler.lastEventId || null;
  s.lastChoiceId = events.scheduler.lastChoiceId || null;
  s.historyLog = Array.isArray(history.systemLog) ? history.systemLog : [];
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
    growth: Number(state.status.growth) || 0
  };
  const wasDead = isPlantDead();
  const isCriticalAlive = !wasDead && before.health < 20;
  if (!wasDead && !isCriticalAlive) {
    return { ok: false };
  }

  if (wasDead) {
    state.status.health = 30;
    state.status.stress = before.stress - 20;
    state.status.risk = before.risk - 15;
    state.status.growth = before.growth < 5 ? 5 : before.growth;
    state.plant.isDead = false;
    if (state.plant.phase === 'dead') {
      const safeIndex = clampInt(Number(state.plant.stageIndex) || 0, 0, STAGE_DEFS.length - 1);
      state.plant.phase = STAGE_DEFS[safeIndex].phase;
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
    growth: Number(state.status.growth) || 0
  };

  return {
    ok: true,
    wasDead,
    effectsApplied: {
      health: round2(after.health - before.health),
      stress: round2(after.stress - before.stress),
      risk: round2(after.risk - before.risk),
      growth: round2(after.growth - before.growth)
    }
  };
}

function syncRuntimeClocks(nowMs) {
  state.simulation.nowMs = nowMs;
  if (!Number.isFinite(state.simulation.simTimeMs)) {
    state.simulation.simTimeMs = alignToSimStartHour(nowMs, SIM_START_HOUR);
  }
  state.simulation.isDaytime = isDaytimeAtSimTime(state.simulation.simTimeMs);
  state.simulation.lastTickRealTimeMs = nowMs;
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
      title: 'Bodenfeuchte prüfen',
      description: 'Bei der manuellen Kontrolle wurde ungleichmäßige Feuchte festgestellt.',
      choices: [
        { id: 'fallback_care', label: 'Ausgewogene Pflege anwenden', effects: { water: 6, stress: -2, health: 2 } },
        { id: 'fallback_wait', label: 'Einen Zyklus warten', effects: { stress: 2, risk: 2 } },
        { id: 'fallback_mix', label: 'Obere Schicht vorsichtig auflockern', effects: { health: 1, risk: -1 } }
      ]
    }, 'v1'));

    addLog('system', 'events.json/events.v2.json konnten nicht geladen werden, Fallback-Katalog aktiv', null);
  }

  state.events.catalog = catalogs.filter(Boolean);
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
  if (state.events.machineState !== 'activeEvent' || !state.events.activeEventId) {
    return;
  }

  const eventDef = state.events.catalog.find((eventItem) => eventItem.id === state.events.activeEventId);
  if (!eventDef) {
    return;
  }

  state.events.activeEventTitle = eventDef.title;
  state.events.activeEventText = eventDef.description;
  state.events.activeLearningNote = eventDef.learningNote || '';
  state.events.activeSeverity = eventDef.severity;
  state.events.activeCooldownRealMinutes = eventDef.cooldownRealMinutes || 120;
  state.events.activeCategory = eventDef.category || 'generic';
  state.events.activeTags = Array.isArray(eventDef.tags) ? eventDef.tags.slice(0, 5) : [];

  const byOptionId = new Map(eventDef.options.map((option) => [option.id, option]));
  const currentIds = Array.isArray(state.events.activeOptions)
    ? state.events.activeOptions.map((option) => option.id)
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

  state.events.activeOptions = localizedOptions.slice(0, 3);
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
  if (!state.simulation.isDaytime) {
    nextAt = nextDaytimeRealMs(nowMs, state.simulation.simTimeMs);
  }
  state.events.scheduler.nextEventRealTimeMs = nextAt;

  addLog('event_roll', 'Nächster Ereigniswurf geplant', {
    reason,
    nextEventAtMs: nextAt,
    simDaytime: state.simulation.isDaytime
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
    addLog('system', 'Push wird in diesem Browser nicht unterstützt', null);
    renderAnalysisPanel(true);
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    addLog('system', `Benachrichtigungsberechtigung: ${permission}`, null);

    if (permission !== 'granted') {
      renderAnalysisPanel(true);
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
    renderAnalysisPanel(true);
    schedulePersistState(true);
  } catch (error) {
    addLog('system', `Push-Abonnement fehlgeschlagen: ${error.message}`, null);
    renderAnalysisPanel(true);
  }
}

async function schedulePushIfAllowed(force) {
  if (!state.settings || state.settings.pushNotificationsEnabled !== true) {
    return;
  }

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return;
  }

  const subRaw = localStorage.getItem(PUSH_SUB_KEY);
  if (!subRaw) {
    return;
  }

  if (!force && state.simulation.lastPushScheduleAtMs === state.events.scheduler.nextEventRealTimeMs) {
    return;
  }

  state.simulation.lastPushScheduleAtMs = state.events.scheduler.nextEventRealTimeMs;

  let subscriptionPayload = null;
  try {
    subscriptionPayload = JSON.parse(subRaw);
  } catch (_error) {
    return;
  }

  // TODO: Replace stub call when backend is implemented.
  await postJsonStub(appPath('api/push/schedule'), {
    nextEventAt: state.events.scheduler.nextEventRealTimeMs,
    cooldownUntil: state.events.cooldownUntilMs,
    subscription: subscriptionPayload
  });
}

function notifyPlantNeedsCare(bodyText) {
  if (!state.settings || state.settings.pushNotificationsEnabled !== true) {
    return;
  }

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return;
  }

  if (!('serviceWorker' in navigator)) {
    return;
  }

  const payload = {
    type: 'SHOW_NOTIFICATION',
    title: 'GrowSim',
    options: {
      body: String(bodyText || 'Deine Pflanze braucht Pflege.'),
      icon: '/icons/icon-192.png'
    }
  };

  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage(payload);
    return;
  }

  navigator.serviceWorker.ready
    .then((registration) => {
      if (registration && registration.active) {
        registration.active.postMessage(payload);
      }
    })
    .catch(() => {
      // non-fatal
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

function dbDelete(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const request = store.delete(key);
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
