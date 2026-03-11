'use strict';

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

  const rawElapsed = nowMs - prevTickRealTimeMs;
  const elapsedRealMs = Number.isFinite(rawElapsed) && rawElapsed > 0
    ? clamp(rawElapsed, 0, MAX_ELAPSED_PER_TICK_MS)
    : 0;
  applySimulationDelta(elapsedRealMs, nowMs);

  if (state.ui.openSheet !== prevOpenSheet) {
    renderSheets();
  }

  renderHud();
  state.ui.lastRenderRealMs = nowMs;
  renderEventSheet();
  renderAnalysisPanel();
  renderDeathOverlay();
  schedulePersistState();
}

function applySimulationDelta(elapsedRealMs, nowMs) {
  const safeElapsedRealMs = Number.isFinite(elapsedRealMs) && elapsedRealMs > 0 ? elapsedRealMs : 0;
  const plantTime = getPlantTimeFromElapsed(nowMs);
  const previousSimTimeMs = Number(state.simulation.simTimeMs) || Number(state.simulation.simEpochMs) || plantTime.simTimeMs;
  const elapsedSimMs = Math.max(0, plantTime.simTimeMs - previousSimTimeMs);

  state.simulation.simTimeMs = plantTime.simTimeMs;
  state.simulation.isDaytime = isDaytimeAtSimTime(state.simulation.simTimeMs);
  state.simulation.lastTickRealTimeMs = nowMs;

  applyStatusDrift(safeElapsedRealMs);
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
  evaluateNotificationTriggers(nowMs);
}

function syncSimulationFromElapsedTime(nowMs) {
  state.simulation.nowMs = nowMs;

  if (syncDeathState() && FREEZE_SIM_ON_DEATH) {
    state.simulation.lastTickRealTimeMs = nowMs;
    state.simulation.growthImpulse = 0;
    syncCanonicalStateShape();
    return;
  }

  const previousTickMs = Number(state.simulation.lastTickRealTimeMs);
  const safePreviousTickMs = Number.isFinite(previousTickMs) ? previousTickMs : nowMs;
  const elapsedRealMs = Math.max(0, nowMs - safePreviousTickMs);
  const elapsedOfflineSimMs = Math.min(elapsedRealMs, MAX_OFFLINE_SIM_MS);
  const wasDeadBeforeCatchUp = isPlantDead();

  if (elapsedRealMs > MAX_OFFLINE_SIM_MS) {
    addLog('system', 'Du warst lange weg. Es wurden maximal 8 Stunden simuliert.', {
      offlineElapsedHours: round2(elapsedRealMs / (60 * 60 * 1000)),
      simulatedHours: round2(MAX_OFFLINE_SIM_MS / (60 * 60 * 1000))
    });
  }

  applySimulationDelta(elapsedOfflineSimMs, nowMs);

  if (!wasDeadBeforeCatchUp && isPlantDead() && shouldProtectOfflineNightDeath(safePreviousTickMs, nowMs)) {
    applyOfflineNightSurvivalClamp();
    syncCanonicalStateShape();
  }
}


function isNightHourLocal(hour) {
  return hour >= 22 || hour < 8;
}

function intervalOverlapsNightWindow(startMs, endMs) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return false;
  }

  const start = new Date(startMs);
  const end = new Date(endMs);
  const dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();

  for (let cursor = dayStart - 24 * 60 * 60 * 1000; cursor <= endMs; cursor += 24 * 60 * 60 * 1000) {
    const nightStart = cursor + (22 * 60 * 60 * 1000);
    const nightEnd = cursor + (32 * 60 * 60 * 1000);
    if (startMs < nightEnd && endMs > nightStart) {
      return true;
    }
  }

  return false;
}

function shouldProtectOfflineNightDeath(previousTickMs, nowMs) {
  if (!Number.isFinite(previousTickMs) || !Number.isFinite(nowMs) || nowMs <= previousTickMs) {
    return false;
  }

  const nowHour = new Date(nowMs).getHours();
  if (isNightHourLocal(nowHour)) {
    return true;
  }

  return intervalOverlapsNightWindow(previousTickMs, nowMs);
}

function applyOfflineNightSurvivalClamp() {
  state.status.health = Math.max(8, Number(state.status.health) || 0);
  state.status.water = Math.max(6, Number(state.status.water) || 0);
  state.status.nutrition = Math.max(6, Number(state.status.nutrition) || 0);
  state.status.stress = Math.max(88, Number(state.status.stress) || 0);
  state.status.risk = Math.max(92, Number(state.status.risk) || 0);

  state.plant.isDead = false;
  state.plant.phase = getStageTimeline()[clampInt(Number(state.plant.stageIndex) || 0, 0, Math.max(0, getStageTimeline().length - 1))]?.phase || 'seedling';
  state.plant.stageKey = stageAssetKeyForIndex(state.plant.stageIndex);
  state.ui.deathOverlayOpen = false;
  state.ui.deathOverlayAcknowledged = false;

  const meta = getCanonicalMeta(state);
  meta.rescue.lastResult = 'Offline-Nacht: Pflanze knapp überlebt und ist kritisch.';
  addLog('system', 'Offline-Nachtschutz aktiv: Todeszustand verhindert', {
    health: round2(state.status.health),
    stress: round2(state.status.stress),
    risk: round2(state.status.risk)
  });
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
  const prevGrowth = Number(state.status.growth) || 0;

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
  const stage = getCurrentStage(simDay);

  state.plant.stageIndex = stage.stageIndex;
  state.plant.phase = stage.current.phase;
  state.plant.stageKey = stageAssetKeyForIndex(stage.stageIndex);
  state.plant.lastValidStageKey = state.plant.stageKey;
  state.plant.stageProgress = stage.progressInPhase;
  state.status.growth = round2(computeGrowthPercent(state.simulation.nowMs));

  if (state.debug.enabled && state.debug.showInternalTicks && state.simulation.tickCount % CONFIG.logTickEveryNTicks === 0) {
    console.debug('[growth]', {
      tick: state.simulation.tickCount,
      simTimeMs: state.simulation.simTimeMs,
      oldGrowth: round2(prevGrowth),
      newGrowth: state.status.growth,
      water: round2(state.status.water),
      nutrients: round2(state.status.nutrition),
      stress: round2(state.status.stress),
      risk: round2(state.status.risk),
      eventActive: state.events.machineState === 'activeEvent'
    });
  }
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

function getElapsedRealMsSinceRunStart(nowMs) {
  const startMs = Number(state.simulation.startRealTimeMs);
  const safeStartMs = Number.isFinite(startMs) ? startMs : nowMs;
  return clamp(nowMs - safeStartMs, 0, REAL_RUN_DURATION_MS);
}

function getTotalRunProgress(nowMs) {
  return clamp(getElapsedRealMsSinceRunStart(nowMs) / REAL_RUN_DURATION_MS, 0, 1);
}

function getPlantTimeFromElapsed(nowMs) {
  const totalRunProgress = getTotalRunProgress(nowMs);
  const elapsedPlantMs = totalRunProgress * TOTAL_LIFECYCLE_SIM_MS;
  const simTimeMs = Number(state.simulation.simEpochMs) + elapsedPlantMs;

  return {
    totalRunProgress,
    elapsedPlantMs,
    simTimeMs,
    simDay: clamp(elapsedPlantMs / SIM_DAY_MS, 0, TOTAL_LIFECYCLE_SIM_DAYS)
  };
}

function getStageTimeline() {
  const source = Array.isArray(STAGE_DEFS) && STAGE_DEFS.length >= 2 ? STAGE_DEFS : DEFAULT_STAGE_TIMELINE;
  const cleaned = [];

  for (let i = 0; i < source.length; i += 1) {
    const item = source[i] || {};
    const rawStart = Number(item.simDayStart);
    const simDayStart = Number.isFinite(rawStart) ? rawStart : NaN;
    if (!Number.isFinite(simDayStart)) {
      continue;
    }
    cleaned.push({
      index: cleaned.length,
      id: typeof item.id === 'string' && item.id ? item.id : `stage_${i + 1}`,
      label: typeof item.label === 'string' && item.label ? item.label : `Phase ${i + 1}`,
      phase: typeof item.phase === 'string' && item.phase ? item.phase : 'vegetative',
      simDayStart: clamp(simDayStart, 0, TOTAL_LIFECYCLE_SIM_DAYS)
    });
  }

  cleaned.sort((a, b) => a.simDayStart - b.simDayStart);
  const strictlyIncreasing = cleaned.length >= 2
    && cleaned[0].simDayStart === 0
    && cleaned.every((stage, idx) => idx === 0 || stage.simDayStart > cleaned[idx - 1].simDayStart);

  return strictlyIncreasing ? cleaned : DEFAULT_STAGE_TIMELINE;
}

function getCurrentStage(simDay) {
  const timeline = getStageTimeline();
  const safeDay = clamp(Number(simDay) || 0, 0, TOTAL_LIFECYCLE_SIM_DAYS);

  let currentIndex = timeline.length - 1;
  for (let i = 0; i < timeline.length; i += 1) {
    const current = timeline[i];
    const next = timeline[i + 1];
    const endDay = next ? next.simDayStart : TOTAL_LIFECYCLE_SIM_DAYS;
    if (safeDay >= current.simDayStart && safeDay < endDay) {
      currentIndex = i;
      break;
    }
  }

  const current = timeline[currentIndex] || timeline[0];
  const next = timeline[currentIndex + 1] || null;
  const startDay = current ? current.simDayStart : 0;
  const endDay = next ? next.simDayStart : TOTAL_LIFECYCLE_SIM_DAYS;
  const span = Math.max(0.25, endDay - startDay);
  const progressInPhase = clamp((safeDay - startDay) / span, 0, 1);

  return {
    timeline,
    stageIndex: currentIndex,
    current,
    next,
    startDay,
    endDay,
    progressInPhase
  };
}

function computeGrowthPercent(nowMs = Date.now()) {
  if (state.plant.phase === 'dead') {
    return 0;
  }
  return round2(getTotalRunProgress(nowMs) * 100);
}

function computeStageProgress(simDay, stageIndex) {
  const snapshot = getCurrentStage(simDay);
  if (clampInt(stageIndex, 0, snapshot.timeline.length - 1) !== snapshot.stageIndex) {
    return snapshot.progressInPhase;
  }
  return snapshot.progressInPhase;
}

function getPhaseCardViewModel() {
  const isDead = state.plant.phase === 'dead' || state.plant.isDead === true;
  const stage = getCurrentStage(simDayFloat());
  const fallbackPhaseLabel = PHASE_LABEL_DE[state.plant.phase] || PHASE_LABEL_DE.seedling;
  const title = stage.current && stage.current.label ? stage.current.label : fallbackPhaseLabel;
  const progressPercent = clamp(Math.round(stage.progressInPhase * 100), 0, 100);

  if (isDead) {
    return {
      title,
      subtitle: 'Pflanze eingegangen',
      progressPercent: 100,
      nextLabel: null
    };
  }

  if (!stage.next) {
    return {
      title,
      subtitle: progressPercent >= 100 ? 'Finish läuft' : `${progressPercent}% bis Ernte`,
      progressPercent,
      nextLabel: 'Ernte'
    };
  }

  return {
    title,
    subtitle: `${progressPercent}% bis ${stage.next.label}`,
    progressPercent,
    nextLabel: stage.next.label
  };
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

function onBoostAction() {
  const BOOST_PLANT_EFFECT_MS = 6 * 60 * 1000;
  const BOOST_GROWTH_PERCENT_DELTA = 0.1;

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
  applyStatusDrift(BOOST_PLANT_EFFECT_MS);
  applyGrowthPercentDelta(BOOST_GROWTH_PERCENT_DELTA);

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
  const realDeltaMs = Math.ceil(simDeltaMs * (REAL_RUN_DURATION_MS / TOTAL_LIFECYCLE_SIM_MS));
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

function round2(value) {
  return Math.round(value * 100) / 100;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function clampInt(value, min, max) {
  return Math.min(max, Math.max(min, Math.trunc(Number(value) || 0)));
}

function syncRuntimeClocks(nowMs) {
  state.simulation.nowMs = nowMs;
  if (!Number.isFinite(state.simulation.simTimeMs)) {
    state.simulation.simTimeMs = alignToSimStartHour(nowMs, SIM_START_HOUR);
  }
  state.simulation.isDaytime = isDaytimeAtSimTime(state.simulation.simTimeMs);
  if (!Number.isFinite(state.simulation.lastTickRealTimeMs)) {
    state.simulation.lastTickRealTimeMs = nowMs;
  }
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
