/*
ASSUMPTIONS:
- This Phase-1 implementation follows docs/PLAN.md architecture with one nested state object and one central tick loop.
- Runtime mode defaults to "dev" for faster verification and can be switched via CONFIG.MODE.
- /api/push/subscribe and /api/push/schedule are backend stubs; failures are logged but never break the app.
*/

'use strict';

const CONFIG = Object.freeze({
  MODE: 'dev',
  timing: Object.freeze({
    uiTickMs: 1000,
    devRollMinMs: 30_000,
    devRollMaxMs: 60_000,
    devCooldownMs: 60_000,
    prodRollMs: 600_000,
    prodCooldownMs: 1_200_000
  }),
  boostAdvanceMs: 30 * 60 * 1000,
  maxHistoryLog: 200,
  persistThrottleMs: 2500,
  logTickEveryNTicks: 10,
  actionDebounceMs: 450
});

const MODE = CONFIG.MODE === 'prod' ? 'prod' : 'dev';
const UI_TICK_INTERVAL_MS = CONFIG.timing.uiTickMs;
const DEV_ROLL_MIN_MS = CONFIG.timing.devRollMinMs;
const DEV_ROLL_MAX_MS = CONFIG.timing.devRollMaxMs;
const DEV_COOLDOWN_MS = CONFIG.timing.devCooldownMs;
const PROD_ROLL_MS = CONFIG.timing.prodRollMs;
const PROD_COOLDOWN_MS = CONFIG.timing.prodCooldownMs;
const BOOST_ADVANCE_MS = CONFIG.boostAdvanceMs;
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
const VAPID_PUBLIC_KEY = 'BElxPLACEHOLDERp8v2C4CwY6ofqP5E8v2rFjQvqW8g4bW2-v8JvKc-l7dXXn4N1xqjY7PqFhL3O8m4jzWzI8v7jA';

const STAGE_MAP = Object.freeze({
  seedling: Object.freeze({
    phaseLabel: 'seedling',
    files: Object.freeze(['seedling_01.png', 'seedling_02.png']),
    ticksPerStage: Object.freeze([32, 40])
  }),
  vegetative: Object.freeze({
    phaseLabel: 'veg',
    files: Object.freeze(['veg_01.png', 'veg_02.png', 'veg_03.png', 'veg_04.png']),
    ticksPerStage: Object.freeze([48, 54, 60, 68])
  }),
  flowering: Object.freeze({
    phaseLabel: 'flower',
    files: Object.freeze(['flower_01.png', 'flower_02.png', 'flower_03.png']),
    ticksPerStage: Object.freeze([78, 90, 104])
  })
});

const PHASE_ORDER = Object.freeze(['seedling', 'vegetative', 'flowering']);
const PHASE_LABEL_DE = Object.freeze({
  seedling: 'Keimling',
  vegetative: 'Vegetativ',
  flowering: 'Bluete',
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
const state = {
  schemaVersion: 2,
  sim: {
    nowMs: now,
    tickCount: 0,
    mode: MODE,
    tickIntervalMs: UI_TICK_INTERVAL_MS,
    lastTickAtMs: now,
    growthImpulse: 0,
    lastPushScheduleAtMs: 0
  },
  growth: {
    phase: 'seedling',
    stageIndex: 0,
    stageName: STAGE_MAP.seedling.files[0],
    stageProgress: 0,
    ticksInStage: 0,
    lastValidStageName: STAGE_MAP.seedling.files[0]
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
    activeOptions: [],
    activeSeverity: 1,
    activeTags: [],
    lastEventAtMs: 0,
    nextEventAtMs: now + (MODE === 'dev' ? DEV_ROLL_MIN_MS : PROD_ROLL_MS),
    cooldownUntilMs: 0,
    lastChoiceId: null,
    catalog: []
  },
  ui: {
    openSheet: null,
    selectedBackground: 'bg_dark_01.jpg',
    visibleOverlayIds: []
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

document.addEventListener('DOMContentLoaded', init);

async function init() {
  cacheUi();
  if (!ensureRequiredUi()) {
    return;
  }
  bindUi();
  applyBackgroundAsset();
  await registerServiceWorker();

  storageAdapter = await createStorageAdapter();
  await restoreState();
  await loadEventCatalog();

  ensureStateIntegrity(Date.now());
  syncRuntimeClocks(Date.now());
  syncActiveEventFromCatalog();
  updateVisibleOverlays();
  addLog('system', 'Runtime initialisiert', {
    mode: state.sim.mode,
    events: state.event.catalog.length
  });

  renderAll();
  await schedulePushIfAllowed(true);
  await persistState();

  if (tickHandle === null) {
    tickHandle = setInterval(tick, state.sim.tickIntervalMs);
  }
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

  ui.confirmCareBtn = document.getElementById('confirmCareBtn');
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
}

function bindUi() {
  ui.careActionBtn.addEventListener('click', () => withDebouncedAction('care', ui.careActionBtn, () => openSheet('care')));
  ui.analyzeActionBtn.addEventListener('click', () => withDebouncedAction('analyze', ui.analyzeActionBtn, () => openSheet('dashboard')));
  ui.boostActionBtn.addEventListener('click', () => withDebouncedAction('boost', ui.boostActionBtn, onBoostAction));
  ui.openDiagnosisBtn.addEventListener('click', () => openSheet('diagnosis'));
  ui.confirmCareBtn.addEventListener('click', () => withDebouncedAction('confirm_care', ui.confirmCareBtn, onCareApply));
  ui.pushSubscribeBtn.addEventListener('click', () => withDebouncedAction('push_subscribe', ui.pushSubscribeBtn, onPushSubscribe));
  ui.clearLogBtn.addEventListener('click', () => withDebouncedAction('clear_log', ui.clearLogBtn, onClearLog));
  ui.backdrop.addEventListener('click', closeSheet);

  const closeButtons = document.querySelectorAll('[data-close-sheet]');
  for (const button of closeButtons) {
    button.addEventListener('click', closeSheet);
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
}

function tick() {
  const nowMs = Date.now();
  const elapsedMs = clamp(nowMs - state.sim.lastTickAtMs, 0, MAX_ELAPSED_PER_TICK_MS);
  const prevOpenSheet = state.ui.openSheet;

  state.sim.nowMs = nowMs;
  state.sim.lastTickAtMs = nowMs;
  state.sim.tickCount += 1;

  applyStatusDrift(elapsedMs);
  advanceGrowthTick();
  runEventStateMachine(nowMs);
  resetBoostDaily(nowMs);
  updateVisibleOverlays();

  if (state.sim.tickCount % CONFIG.logTickEveryNTicks === 0) {
    addLog('tick', `Tick #${state.sim.tickCount}`, {
      elapsedMs,
      phase: state.growth.phase,
      stage: state.growth.stageName,
      eventState: state.event.machineState
    });
  }

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
    'confirmCareBtn', 'eventStateBadge', 'eventTitle', 'eventText', 'eventMeta', 'eventOptionList',
    'pushSubscribeBtn', 'clearLogBtn', 'lastEventValue', 'lastChoiceValue', 'logList'
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

function advanceGrowthTick() {
  if (state.growth.phase === 'dead') {
    state.growth.stageProgress = 1;
    return;
  }

  if (state.status.health <= 0 || state.status.risk >= 100) {
    enterDeadPhase();
    return;
  }

  const stageInfo = STAGE_MAP[state.growth.phase];
  const currentTicksTarget = stageInfo.ticksPerStage[state.growth.stageIndex];

  const progressionMultiplier = clamp(1 + (state.sim.growthImpulse * 0.35), 0.25, 1.8);
  state.growth.ticksInStage += progressionMultiplier;
  state.growth.stageProgress = clamp(state.growth.ticksInStage / currentTicksTarget, 0, 1);

  if (state.growth.stageProgress >= 1) {
    if (state.growth.phase === 'flowering' && state.growth.stageIndex === stageInfo.files.length - 1) {
      state.growth.stageProgress = 1;
      state.growth.ticksInStage = currentTicksTarget;
    } else {
      moveToNextStage();
    }
  }

  state.status.growth = round2(computeGrowthPercent());
}

function moveToNextStage() {
  const currentPhase = state.growth.phase;
  const phaseData = STAGE_MAP[currentPhase];

  if (state.growth.stageIndex < phaseData.files.length - 1) {
    setGrowthStage(currentPhase, state.growth.stageIndex + 1, 0);
    return;
  }

  const phaseIdx = PHASE_ORDER.indexOf(currentPhase);
  const nextPhase = PHASE_ORDER[phaseIdx + 1];

  if (!nextPhase) {
    setGrowthStage('flowering', STAGE_MAP.flowering.files.length - 1, 1);
    return;
  }

  setGrowthStage(nextPhase, 0, 0);
}

function setGrowthStage(phase, stageIndex, progress) {
  const phaseData = STAGE_MAP[phase];
  if (!phaseData) {
    return;
  }

  const safeIndex = clampInt(stageIndex, 0, phaseData.files.length - 1);
  const safeProgress = clamp(progress, 0, 1);
  const ticksTarget = phaseData.ticksPerStage[safeIndex];

  state.growth.phase = phase;
  state.growth.stageIndex = safeIndex;
  state.growth.stageProgress = safeProgress;
  state.growth.ticksInStage = Math.round(safeProgress * ticksTarget);
  state.growth.stageName = phaseData.files[safeIndex];
  state.growth.lastValidStageName = state.growth.stageName;
}

function enterDeadPhase() {
  state.growth.phase = 'dead';
  state.growth.stageProgress = 1;
  state.growth.stageName = state.growth.lastValidStageName || STAGE_MAP.seedling.files[0];
  addLog('system', 'Todesphase erreicht', { stageName: state.growth.stageName });
}

function computeGrowthPercent() {
  if (state.growth.phase === 'dead') {
    return 0;
  }

  const totalStages = totalStageCount();
  const absoluteIdx = absoluteStageIndex(state.growth.phase, state.growth.stageIndex);
  const unit = absoluteIdx + state.growth.stageProgress;
  return clamp((unit / totalStages) * 100, 0, 100);
}

function totalStageCount() {
  return STAGE_MAP.seedling.files.length + STAGE_MAP.vegetative.files.length + STAGE_MAP.flowering.files.length;
}

function absoluteStageIndex(phase, stageIndex) {
  if (phase === 'seedling') {
    return stageIndex;
  }
  if (phase === 'vegetative') {
    return STAGE_MAP.seedling.files.length + stageIndex;
  }
  if (phase === 'flowering' || phase === 'dead') {
    return STAGE_MAP.seedling.files.length + STAGE_MAP.vegetative.files.length + stageIndex;
  }
  return 0;
}

function runEventStateMachine(nowMs) {
  if (state.event.machineState === 'resolved') {
    enterEventCooldown(nowMs);
  }

  if (state.event.machineState === 'cooldown') {
    if (nowMs >= state.event.nextEventAtMs) {
      addLog('event_roll', 'Ereigniswurf wegen Abklingzeit uebersprungen', {
        cooldownUntilMs: state.event.cooldownUntilMs
      });
      scheduleNextEventRoll(nowMs, 'cooldown');
      schedulePushIfAllowed(false);
    }

    if (nowMs >= state.event.cooldownUntilMs) {
      state.event.machineState = 'idle';
      addLog('system', 'Abklingzeit beendet, Status wieder inaktiv', null);
    }
  }

  if (state.event.machineState === 'activeEvent' && nowMs >= state.event.nextEventAtMs) {
    addLog('event_roll', 'Ereigniswurf uebersprungen, aktives Ereignis noch offen', {
      activeEventId: state.event.activeEventId
    });
    scheduleNextEventRoll(nowMs, 'active_event_pending');
    schedulePushIfAllowed(false);
  }

  if (state.event.machineState === 'idle' && nowMs >= state.event.nextEventAtMs) {
    const roll = deterministicRoll();
    const trigger = shouldTriggerEvent(roll);

    addLog('event_roll', trigger ? 'Ereigniswurf erfolgreich' : 'Ereigniswurf nicht erfolgreich', {
      roll,
      threshold: eventThreshold(),
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

  const eventDef = selectEventDeterministically(catalog);
  const options = eventDef.choices.slice(0, 3);

  state.event.machineState = 'activeEvent';
  state.event.activeEventId = eventDef.id;
  state.lastEventId = eventDef.id;
  state.event.activeEventTitle = eventDef.title;
  state.event.activeEventText = eventDef.description;
  state.event.activeOptions = options;
  state.event.activeSeverity = eventDef.severity || 3;
  state.event.activeTags = Array.isArray(eventDef.tags) ? eventDef.tags.slice(0, 5) : [];
  state.event.lastEventAtMs = nowMs;

  addLog('event_shown', `Ereignis ausgewaehlt: ${eventDef.id}`, {
    title: eventDef.title,
    severity: state.event.activeSeverity
  });
}

function onEventOptionClick(optionId) {
  if (state.event.machineState !== 'activeEvent') {
    return;
  }

  const choice = state.event.activeOptions.find((option) => option.id === optionId);
  if (!choice) {
    return;
  }

  applyChoiceEffects(choice.effects || {});
  state.event.lastChoiceId = choice.id;
  state.lastChoiceId = choice.id;
  state.event.machineState = 'resolved';

  addLog('choice', `Option gewaehlt: ${state.event.activeEventId}/${choice.id}`, {
    effects: choice.effects || {},
    followUp: choice.followUp || null
  });

  runEventStateMachine(state.sim.nowMs);
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

  const total = totalStageCount();
  const units = clamp((percent / 100) * total, 0, total);
  const absoluteIndex = Math.min(total - 1, Math.floor(units));
  const stageProgress = clamp(units - absoluteIndex, 0, 1);
  const mapping = phaseStageFromAbsoluteIndex(absoluteIndex);
  setGrowthStage(mapping.phase, mapping.stageIndex, stageProgress);
}

function phaseStageFromAbsoluteIndex(index) {
  const seedlingCount = STAGE_MAP.seedling.files.length;
  const vegetativeCount = STAGE_MAP.vegetative.files.length;

  if (index < seedlingCount) {
    return { phase: 'seedling', stageIndex: index };
  }
  if (index < seedlingCount + vegetativeCount) {
    return { phase: 'vegetative', stageIndex: index - seedlingCount };
  }
  return {
    phase: 'flowering',
    stageIndex: index - seedlingCount - vegetativeCount
  };
}

function enterEventCooldown(nowMs) {
  state.event.machineState = 'cooldown';
  state.event.cooldownUntilMs = nowMs + cooldownMs();
  state.event.activeEventId = null;
  state.event.activeEventTitle = '';
  state.event.activeEventText = '';
  state.event.activeOptions = [];
  state.event.activeSeverity = 1;
  state.event.activeTags = [];

  addLog('system', 'Ereignis abgeschlossen, Abklingzeit gestartet', {
    cooldownUntilMs: state.event.cooldownUntilMs
  });
}

function deterministicRoll() {
  const seed = (
    state.sim.tickCount * 73 +
    state.growth.stageIndex * 29 +
    Math.round(state.status.risk) * 13 +
    stableDaySeed()
  ) % 1000;

  return seed / 1000;
}

function eventThreshold() {
  const base = state.sim.mode === 'dev' ? 0.55 : 0.28;
  const riskInfluence = state.status.risk / 300;
  return clamp(base + riskInfluence, 0.1, 0.92);
}

function shouldTriggerEvent(roll) {
  return roll < eventThreshold();
}

function nextRollDelayMs(seedOffset) {
  if (state.sim.mode !== 'dev') {
    return PROD_ROLL_MS;
  }

  const span = DEV_ROLL_MAX_MS - DEV_ROLL_MIN_MS;
  const seed = Math.abs((seedOffset * 997) + Math.round(state.status.risk * 17) + state.sim.tickCount * 37);
  return DEV_ROLL_MIN_MS + (seed % (span + 1));
}

function cooldownMs() {
  return state.sim.mode === 'dev' ? DEV_COOLDOWN_MS : PROD_COOLDOWN_MS;
}

function onCareApply() {
  state.status.water += 10;
  state.status.nutrition += 7;
  state.status.stress -= 6;
  state.status.health += 4;
  state.status.risk -= 4;
  applyGrowthPercentDelta(1.5);
  clampStatus();

  addLog('action', 'Pflegeaktion angewendet', {
    health: state.status.health,
    stress: state.status.stress,
    water: state.status.water,
    nutrition: state.status.nutrition
  });

  closeSheet();
  renderAll();
  schedulePersistState(true);
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
  renderEventSheet();
  renderDashboardSummary();
  renderLogList();
}

function renderHud() {
  const phaseLabel = PHASE_LABEL_DE[state.growth.phase] || PHASE_LABEL_DE.seedling;
  const statusText = `Phase: ${phaseLabel}`;
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

  if (ui.plantImage.dataset.stageName !== state.growth.stageName) {
    ui.plantImage.src = plantAssetPath(state.growth.stageName);
    ui.plantImage.dataset.stageName = state.growth.stageName;
  }

  const eventInMs = state.event.nextEventAtMs - state.sim.nowMs;
  ui.nextEventValue.textContent = formatCountdown(eventInMs);
  ui.growthImpulseValue.textContent = state.sim.growthImpulse.toFixed(2);
  ui.simTimeValue.textContent = new Date(state.sim.nowMs).toLocaleTimeString('de-DE');

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
    id: `${timestamp}-${Math.random().toString(16).slice(2, 8)}`,
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
  return appPath(`assets/plant/${stageName}`);
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
  if (saved.ui && typeof saved.ui === 'object') {
    Object.assign(state.ui, saved.ui);
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

function ensureStateIntegrity(nowMs) {
  if (!Number.isFinite(state.schemaVersion)) {
    state.schemaVersion = 2;
  }

  state.sim.mode = MODE;
  state.sim.tickIntervalMs = UI_TICK_INTERVAL_MS;

  if (!Number.isFinite(state.sim.nowMs)) {
    state.sim.nowMs = nowMs;
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

  const phase = state.growth.phase;
  if (!Object.prototype.hasOwnProperty.call(STAGE_MAP, phase) && phase !== 'dead') {
    state.growth.phase = 'seedling';
    state.growth.stageIndex = 0;
  }

  if (state.growth.phase !== 'dead') {
    const phaseData = STAGE_MAP[state.growth.phase];
    state.growth.stageIndex = clampInt(state.growth.stageIndex, 0, phaseData.files.length - 1);
    state.growth.stageProgress = clamp(state.growth.stageProgress, 0, 1);
    state.growth.stageName = phaseData.files[state.growth.stageIndex];
    state.growth.lastValidStageName = state.growth.stageName;
  } else {
    state.growth.stageName = state.growth.lastValidStageName || STAGE_MAP.seedling.files[0];
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
    state.event.nextEventAtMs = nowMs + nextRollDelayMs(state.sim.tickCount);
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

  const validSheets = new Set([null, 'care', 'event', 'dashboard', 'diagnosis']);
  if (!validSheets.has(state.ui.openSheet)) {
    state.ui.openSheet = null;
  }
  if (!Array.isArray(state.ui.visibleOverlayIds)) {
    state.ui.visibleOverlayIds = [];
  }

  if (typeof state.lastEventId !== 'string') {
    state.lastEventId = null;
  }
  if (typeof state.lastChoiceId !== 'string') {
    state.lastChoiceId = null;
  }
}

function syncRuntimeClocks(nowMs) {
  state.sim.nowMs = nowMs;
  state.sim.lastTickAtMs = nowMs;
}

async function loadEventCatalog() {
  try {
    let response = null;
    try {
      response = await fetch(appPath(`data/events.json?v=${EVENTS_CATALOG_VERSION}`), { cache: 'no-store' });
    } catch (_error) {
      response = await fetch(appPath('data/events.json'), { cache: 'default' });
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const events = Array.isArray(payload) ? payload : payload.events;
    if (!Array.isArray(events)) {
      throw new Error('Invalid events payload');
    }

    state.event.catalog = events.map(normalizeEvent).filter(Boolean);
  } catch (error) {
    state.event.catalog = [
      {
        id: 'fallback_soil_check',
        title: 'Bodenfeuchte pruefen',
        description: 'Bei der manuellen Kontrolle wurde ungleichmaessige Feuchte festgestellt.',
        severity: 2,
        tags: ['soil', 'fallback'],
        choices: [
          {
            id: 'fallback_care',
            label: 'Ausgewogene Pflege anwenden',
            effects: { water: 6, stress: -2, health: 2 }
          },
          {
            id: 'fallback_wait',
            label: 'Einen Zyklus warten',
            effects: { stress: 2, risk: 2 }
          },
          {
            id: 'fallback_mix',
            label: 'Obere Schicht vorsichtig auflockern',
            effects: { health: 1, risk: -1 }
          }
        ]
      }
    ];

    addLog('system', 'events.json konnte nicht geladen werden, Fallback-Katalog aktiv', {
      error: error.message
    });
  }
}

function normalizeEvent(rawEvent) {
  if (!rawEvent || typeof rawEvent !== 'object') {
    return null;
  }
  if (!rawEvent.id || !rawEvent.title || !rawEvent.description || !Array.isArray(rawEvent.choices)) {
    return null;
  }

  const choices = rawEvent.choices
    .slice(0, 3)
    .map((choice) => ({
      id: String(choice.id || ''),
      label: String(choice.label || 'Option'),
      effects: choice.effects && typeof choice.effects === 'object' ? choice.effects : {},
      followUp: choice.followUp || null
    }))
    .filter((choice) => Boolean(choice.id));

  if (!choices.length) {
    return null;
  }

  return {
    id: String(rawEvent.id),
    title: String(rawEvent.title),
    description: String(rawEvent.description),
    severity: normalizeSeverity(rawEvent.severity),
    tags: Array.isArray(rawEvent.tags) ? rawEvent.tags.map(String) : [],
    choices
  };
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
  state.event.activeSeverity = eventDef.severity;
  state.event.activeTags = Array.isArray(eventDef.tags) ? eventDef.tags.slice(0, 5) : [];

  const byChoiceId = new Map(eventDef.choices.map((choice) => [choice.id, choice]));
  const currentIds = Array.isArray(state.event.activeOptions)
    ? state.event.activeOptions.map((choice) => choice.id)
    : [];

  const localizedOptions = [];
  for (const choiceId of currentIds) {
    const localizedChoice = byChoiceId.get(choiceId);
    if (localizedChoice) {
      localizedOptions.push({
        id: localizedChoice.id,
        label: localizedChoice.label,
        effects: { ...(localizedChoice.effects || {}) },
        followUp: localizedChoice.followUp || null
      });
    }
  }

  if (!localizedOptions.length) {
    for (const choice of eventDef.choices.slice(0, 3)) {
      localizedOptions.push({
        id: choice.id,
        label: choice.label,
        effects: { ...(choice.effects || {}) },
        followUp: choice.followUp || null
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

function selectEventDeterministically(catalog) {
  const weighted = [];
  for (const eventDef of catalog) {
    const severity = clampInt(eventDef.severity, 1, 5);
    for (let i = 0; i < severity; i += 1) {
      weighted.push(eventDef);
    }
  }

  if (!weighted.length) {
    return catalog[0];
  }

  const seed = (
    state.sim.tickCount * 41 +
    Math.round(state.status.health) * 17 +
    Math.round(state.status.risk) * 13 +
    state.growth.stageIndex * 7 +
    stableDaySeed()
  );
  const idx = Math.abs(seed) % weighted.length;
  return weighted[idx];
}

function stableDaySeed() {
  const key = dayStamp(state.sim.nowMs || Date.now());
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 1000;
  }
  return hash;
}

function scheduleNextEventRoll(nowMs, reason) {
  const delayMs = nextRollDelayMs(state.sim.tickCount);
  state.event.nextEventAtMs = nowMs + delayMs;

  if (state.sim.mode === 'dev') {
    addLog('event_roll', 'Naechster Ereigniswurf geplant', {
      reason,
      delayMs
    });
  }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register(appPath('sw.js'));
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
  return `${APP_BASE_PATH}/${normalized}`.replace(/\/\/+/g, '/');
}
