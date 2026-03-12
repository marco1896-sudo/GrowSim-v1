#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const resolver = require('../src/events/eventResolver');
const memoryApi = require('../src/events/eventMemory');
const flagsApi = require('../src/events/eventFlags');
const analysisApi = require('../src/events/eventAnalysis');
const plantStateApi = require('../src/simulation/plantState');

const REAL_RUN_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const TOTAL_LIFECYCLE_SIM_DAYS = 88;
const SIM_DAY_MS = 24 * 60 * 60 * 1000;
const TOTAL_LIFECYCLE_SIM_MS = TOTAL_LIFECYCLE_SIM_DAYS * SIM_DAY_MS;
const EVENT_ROLL_MIN_REAL_MS = 30 * 60 * 1000;
const EVENT_ROLL_MAX_REAL_MS = 90 * 60 * 1000;
const EVENT_RETRY_MIN_MS = 20 * 1000;
const EVENT_RETRY_MAX_MS = 90 * 1000;
const RESOLVER_DIRECT_INFLUENCE_RATE = 0.12;
const RESOLVER_SHAPED_POOL_INFLUENCE_RATE = 0.10;
const EVENT_COOLDOWN_MS = 20 * 60 * 1000;
const DAY_START_HOUR = 6;
const NIGHT_START_HOUR = 22;
const TICKS_PER_SEED = 1000;
const SEEDS = [1, 42, 123, 999];

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(ROOT, 'dev', 'event_runtime_stats.json');

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function clampInt(value, min, max) {
  return Math.min(max, Math.max(min, Math.trunc(Number(value) || 0)));
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function hashString(input) {
  let h = 2166136261;
  const str = String(input || '');
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function deterministicUnit(seed, key) {
  return (hashString(`${seed}|${String(key || '')}`) % 1_000_000) / 1_000_000;
}

function deterministicRange(seed, key, min, maxInclusive) {
  const safeMin = Math.min(min, maxInclusive);
  const safeMax = Math.max(min, maxInclusive);
  const span = Math.max(0, safeMax - safeMin);
  return safeMin + Math.floor(deterministicUnit(seed, key) * (span + 1));
}

function simHour(simTimeMs) {
  return new Date(simTimeMs).getHours();
}

function isDaytime(simTimeMs) {
  const hour = simHour(simTimeMs);
  return hour >= DAY_START_HOUR && hour < NIGHT_START_HOUR;
}

function nextDaytimeRealMs(realNowMs, simTimeMs) {
  const simDate = new Date(simTimeMs);
  const shifted = new Date(simDate.getTime());
  if (simHour(simTimeMs) >= NIGHT_START_HOUR) {
    shifted.setDate(shifted.getDate() + 1);
  }
  shifted.setHours(DAY_START_HOUR, 0, 0, 0);
  const simDeltaMs = Math.max(0, shifted.getTime() - simTimeMs);
  const realDeltaMs = Math.ceil(simDeltaMs * (REAL_RUN_DURATION_MS / TOTAL_LIFECYCLE_SIM_MS));
  return realNowMs + realDeltaMs;
}

function stageAssetKeyForIndex(stageIndex) {
  return `stage_${String(stageIndex + 1).padStart(2, '0')}`;
}

function normalizeSeverity(rawSeverity) {
  if (Number.isFinite(rawSeverity)) {
    return clampInt(rawSeverity, 1, 5);
  }
  if (typeof rawSeverity === 'string') {
    const lowered = rawSeverity.trim().toLowerCase();
    if (lowered === 'low') return 2;
    if (lowered === 'medium') return 3;
    if (lowered === 'high') return 4;
    const asNumber = Number(lowered);
    if (Number.isFinite(asNumber)) return clampInt(asNumber, 1, 5);
  }
  return 3;
}

function inferCategoryFromTags(tags) {
  const t = Array.isArray(tags) ? tags.map((x) => String(x).toLowerCase()) : [];
  if (t.some((x) => x.includes('water') || x.includes('soil'))) return 'water';
  if (t.some((x) => x.includes('nutri') || x.includes('n'))) return 'nutrition';
  if (t.some((x) => x.includes('pest'))) return 'pest';
  if (t.some((x) => x.includes('mold') || x.includes('disease'))) return 'disease';
  if (t.some((x) => x.includes('train'))) return 'training';
  if (t.some((x) => x.includes('env') || x.includes('heat') || x.includes('cold') || x.includes('weather'))) return 'environment';
  if (t.some((x) => x.includes('positive') || x.includes('recovery') || x.includes('ideal'))) return 'positive';
  return 'generic';
}

function inferEventPolarity(rawEvent, category) {
  const explicit = String((rawEvent && rawEvent.polarity) || '').trim().toLowerCase();
  if (explicit === 'positive' || explicit === 'negative' || explicit === 'neutral') {
    return explicit;
  }
  if (String(category) === 'positive') {
    return 'positive';
  }
  const tags = Array.isArray(rawEvent && rawEvent.tags)
    ? rawEvent.tags.map((x) => String(x).toLowerCase())
    : [];
  if (tags.some((x) => x.includes('positive') || x.includes('ideal') || x.includes('recovery') || x.includes('bonus'))) {
    return 'positive';
  }
  return 'negative';
}

function inferEnvironmentScope(rawEvent) {
  const setup = rawEvent && rawEvent.triggers && rawEvent.triggers.setup && typeof rawEvent.triggers.setup === 'object'
    ? rawEvent.triggers.setup
    : {};
  const modeIn = Array.isArray(setup.modeIn) ? setup.modeIn.map((x) => String(x).toLowerCase()) : [];
  if (!modeIn.length) return 'both';
  const hasIndoor = modeIn.includes('indoor');
  const hasOutdoor = modeIn.includes('outdoor') || modeIn.includes('greenhouse');
  if (hasIndoor && hasOutdoor) return 'both';
  if (hasIndoor) return 'indoor';
  if (hasOutdoor) return 'outdoor';
  return 'both';
}

function normalizeEvent(rawEvent, sourceVersion) {
  if (!rawEvent || typeof rawEvent !== 'object') return null;
  if (!rawEvent.id || !rawEvent.title || !rawEvent.description) return null;

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
        : (option.followUp ? [String(option.followUp)] : [])
    }))
    .filter((option) => Boolean(option.id));

  if (!options.length) return null;

  const category = String(rawEvent.category || inferCategoryFromTags(rawEvent.tags || []));

  return {
    id: String(rawEvent.id),
    category,
    title: String(rawEvent.title),
    description: String(rawEvent.description),
    triggers: rawEvent.triggers && typeof rawEvent.triggers === 'object' ? rawEvent.triggers : {},
    allowedPhases: Array.isArray(rawEvent.allowedPhases)
      ? rawEvent.allowedPhases.map((phase) => String(phase)).filter(Boolean)
      : [],
    weight: Math.max(0.01, Number(rawEvent.weight) || normalizeSeverity(rawEvent.severity) || 1),
    cooldownRealMinutes: clamp(Number(rawEvent.cooldownRealMinutes) || 120, 10, 24 * 60),
    learningNote: String(rawEvent.learningNote || ''),
    severity: normalizeSeverity(rawEvent.severity),
    polarity: inferEventPolarity(rawEvent, category),
    environment: inferEnvironmentScope(rawEvent),
    tags: Array.isArray(rawEvent.tags) ? rawEvent.tags.map(String) : [],
    options,
    sourceVersion,
    pool: rawEvent.pool ? String(rawEvent.pool).toLowerCase() : '',
    tone: rawEvent.tone ? String(rawEvent.tone).toLowerCase() : ''
  };
}

function loadCatalog() {
  const sources = [
    { file: 'data/events.json', version: 'v1' },
    { file: 'data/events.foundation.json', version: 'foundation' },
    { file: 'data/events.v2.json', version: 'v2' }
  ];

  const catalog = [];
  for (const source of sources) {
    const payload = JSON.parse(fs.readFileSync(path.join(ROOT, source.file), 'utf8'));
    const events = Array.isArray(payload) ? payload : (Array.isArray(payload.events) ? payload.events : []);
    for (const rawEvent of events) {
      const normalized = normalizeEvent(rawEvent, source.version);
      if (normalized) catalog.push(normalized);
    }
  }

  return catalog.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function phaseByProgress(progress) {
  const p = clamp(progress, 0, 1);
  if (p < 0.16) return 'seedling';
  if (p < 0.6) return 'vegetative';
  if (p < 0.95) return 'flowering';
  return 'harvest';
}

function resolveTriggerField(runtimeState, fieldPath) {
  if (!fieldPath) return undefined;
  if (fieldPath.startsWith('status.')) return runtimeState.status[fieldPath.split('.')[1]];
  if (fieldPath === 'plant.stageIndex') return runtimeState.plant.stageIndex + 1;
  if (fieldPath === 'plant.stageKey') return runtimeState.plant.stageKey;
  if (fieldPath.startsWith('setup.')) return (runtimeState.setup || {})[fieldPath.split('.')[1]];
  if (fieldPath === 'simulation.isDaytime') return runtimeState.simulation.isDaytime;
  return undefined;
}

function evaluateTriggerCondition(runtimeState, condition) {
  if (!condition || typeof condition !== 'object') return false;
  const field = String(condition.field || '').trim();
  const op = String(condition.op || '==').trim();
  const rhs = condition.value;
  const lhs = resolveTriggerField(runtimeState, field);
  if (op === 'in') return Array.isArray(rhs) && rhs.map(String).includes(String(lhs));
  if (op === 'not_in') return Array.isArray(rhs) && !rhs.map(String).includes(String(lhs));
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

function evaluateSetupConstraints(runtimeState, setupRule) {
  const setup = runtimeState.setup || {};
  for (const [key, values] of Object.entries(setupRule || {})) {
    if (!Array.isArray(values)) continue;
    const prop = key.replace(/In$/, '');
    const current = setup[prop];
    if (!values.map(String).includes(String(current))) return false;
  }
  return true;
}

function evaluateEventTriggers(runtimeState, triggers) {
  const t = triggers && typeof triggers === 'object' ? triggers : {};
  if (t.stage && typeof t.stage === 'object') {
    const stageIndex = runtimeState.plant.stageIndex + 1;
    if (Number.isFinite(Number(t.stage.min)) && stageIndex < Number(t.stage.min)) return false;
    if (Number.isFinite(Number(t.stage.max)) && stageIndex > Number(t.stage.max)) return false;
  }
  if (t.setup && typeof t.setup === 'object' && !evaluateSetupConstraints(runtimeState, t.setup)) {
    return false;
  }
  const all = Array.isArray(t.all) ? t.all : [];
  const any = Array.isArray(t.any) ? t.any : [];
  if (all.length && !all.every((condition) => evaluateTriggerCondition(runtimeState, condition))) return false;
  if (any.length && !any.some((condition) => evaluateTriggerCondition(runtimeState, condition))) return false;
  return true;
}

function isEventPhaseAllowed(runtimeState, eventDef) {
  const allowed = Array.isArray(eventDef.allowedPhases) ? eventDef.allowedPhases : [];
  if (!allowed.length) return true;
  return allowed.includes(String(runtimeState.plant.phase || ''));
}

function computeEventDynamicWeight(runtimeState, schedulerState, eventDef) {
  const base = Math.max(0.01, Number(eventDef.weight) || 1);
  const risk = Number(runtimeState.status.risk) || 0;
  const stress = Number(runtimeState.status.stress) || 0;
  const health = Number(runtimeState.status.health) || 0;
  const recent = Array.isArray(schedulerState.history) ? schedulerState.history.slice(-4) : [];

  let factor = 1;
  if (eventDef.category === 'positive') {
    const negativeRecent = recent.filter((entry) => String((entry && entry.category) || '').toLowerCase() !== 'positive').length;
    const positiveRecent = recent.length - negativeRecent;
    if (negativeRecent >= 2) factor += 0.35;
    if (health < 55) factor += 0.2;
    if (positiveRecent >= 2) factor -= 0.45;
  } else {
    if (risk >= 60) factor += 0.15;
    if (stress >= 55) factor += 0.1;
  }
  if (eventDef.category === 'disease' && risk < 40) factor *= 0.85;
  return Math.max(0.01, round2(base * factor));
}

function selectLegacyWeighted(runtimeState, schedulerState, candidates, seed, key) {
  const sorted = candidates.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  let filtered = sorted;
  if (schedulerState.lastEventCategory) {
    const alt = filtered.filter((item) => item.category !== schedulerState.lastEventCategory);
    if (alt.length) filtered = alt;
  }
  if (schedulerState.lastEventId) {
    const noRepeat = filtered.filter((item) => item.id !== schedulerState.lastEventId);
    if (noRepeat.length) filtered = noRepeat;
  }
  if (!filtered.length) return { selected: null, weights: {}, weightedRoll: null };

  const weighted = filtered.map((item) => ({
    item,
    weight: computeEventDynamicWeight(runtimeState, schedulerState, item)
  }));
  const totalWeight = weighted.reduce((sum, row) => sum + row.weight, 0);
  const rollUnit = Math.max(0, Math.min(1 - Number.EPSILON, deterministicUnit(seed, key)));
  const weightedRoll = rollUnit * totalWeight;
  let cursor = weightedRoll;
  let selected = weighted[weighted.length - 1].item;
  for (const row of weighted) {
    cursor -= row.weight;
    if (cursor <= 0) {
      selected = row.item;
      break;
    }
  }
  const weights = {};
  for (const row of weighted) {
    weights[row.item.id] = row.weight;
  }
  return { selected, weights, weightedRoll };
}

function inferEventPoolName(eventDef) {
  if (!eventDef || typeof eventDef !== 'object') {
    return '';
  }
  const explicitPool = String(eventDef.pool || '').trim().toLowerCase();
  if (explicitPool) {
    return explicitPool;
  }
  if (eventDef.isFollowUp === true) {
    return 'recovery';
  }
  const tone = String(eventDef.tone || '').trim().toLowerCase();
  if (tone === 'positive') return 'reward';
  if (tone === 'negative') return 'warning';
  return 'warning';
}

function shouldUseResolverDirectPick(seed, nowMs, attempt, eventId) {
  const roll = deterministicUnit(seed, `resolver_direct_gate:${Math.floor(nowMs / 1000)}:${attempt}:${String(eventId || '')}`);
  return roll < RESOLVER_DIRECT_INFLUENCE_RATE;
}

function shouldUseResolverShapedPool(seed, nowMs, attempt, selectedPool) {
  const roll = deterministicUnit(seed, `resolver_shape_gate:${Math.floor(nowMs / 1000)}:${attempt}:${String(selectedPool || '')}`);
  return roll < RESOLVER_SHAPED_POOL_INFLUENCE_RATE;
}

function buildResolverShapedPool(eligible, trace) {
  if (!Array.isArray(eligible) || !eligible.length || !trace || typeof trace !== 'object') {
    return [];
  }
  const candidateRows = Array.isArray(trace.afterFrustrationGuard) && trace.afterFrustrationGuard.length
    ? trace.afterFrustrationGuard
    : (Array.isArray(trace.afterRepeatGuard) && trace.afterRepeatGuard.length
      ? trace.afterRepeatGuard
      : (Array.isArray(trace.afterPhaseGuard) ? trace.afterPhaseGuard : []));
  const candidateIds = new Set(candidateRows.map((row) => String(row && row.eventId || '')).filter(Boolean));
  if (!candidateIds.size) {
    return [];
  }
  const fromIds = eligible.filter((eventDef) => candidateIds.has(String(eventDef && eventDef.id || '')));
  if (!fromIds.length) {
    return [];
  }
  const selectedPool = String(trace.selectedPool || '').toLowerCase();
  if (!selectedPool) {
    return fromIds;
  }
  const narrowedByPool = fromIds.filter((eventDef) => inferEventPoolName(eventDef) === selectedPool);
  return narrowedByPool.length ? narrowedByPool : fromIds;
}

function applyEffects(status, effects) {
  for (const [metric, deltaRaw] of Object.entries(effects || {})) {
    const delta = Number(deltaRaw);
    if (!Number.isFinite(delta)) continue;
    if (Object.prototype.hasOwnProperty.call(status, metric)) {
      status[metric] = clamp(status[metric] + delta, 0, 100);
    }
  }
}

function applyFollowUps(eventsState, eventId, option) {
  const stats = {
    chainsCreated: 0,
    chainsCleared: 0,
    flagsSet: 0,
    flagsCleared: 0
  };
  memoryApi.addDecision(eventsState, eventId, option.id, {
    followUps: Array.isArray(option.followUps) ? option.followUps.slice() : []
  });
  for (const tokenRaw of (Array.isArray(option.followUps) ? option.followUps : [])) {
    const token = String(tokenRaw || '');
    if (token.startsWith('set_flag:')) {
      const flagId = token.slice('set_flag:'.length);
      flagsApi.setFlag(eventsState, flagId, true);
      stats.flagsSet += 1;
      if (flagId === 'root_stress_pending') {
        memoryApi.setPendingChain(eventsState, 'root_stress_followup', {
          targetEventId: 'root_stress_followup',
          sourceEventId: eventId,
          sourceOptionId: option.id,
          sourceFlagId: 'root_stress_pending',
          createdAtRealTimeMs: Date.now(),
          meta: { createdBy: 'flag_bridge' }
        });
        stats.chainsCreated += 1;
      }
      continue;
    }
    if (token.startsWith('clear_flag:')) {
      const flagId = token.slice('clear_flag:'.length);
      flagsApi.clearFlag(eventsState, flagId);
      stats.flagsCleared += 1;
      if (flagId === 'root_stress_pending') {
        memoryApi.clearPendingChain(eventsState, 'root_stress_followup');
        stats.chainsCleared += 1;
      }
      continue;
    }
    if (token.startsWith('set_chain:')) {
      const chainId = token.slice('set_chain:'.length);
      memoryApi.setPendingChain(eventsState, chainId, {
        targetEventId: chainId,
        sourceEventId: eventId,
        sourceOptionId: option.id,
        createdAtRealTimeMs: Date.now(),
        meta: { createdBy: 'followup_token' }
      });
      stats.chainsCreated += 1;
      continue;
    }
    if (token.startsWith('clear_chain:')) {
      const chainId = token.slice('clear_chain:'.length);
      memoryApi.clearPendingChain(eventsState, chainId);
      stats.chainsCleared += 1;
    }
  }
  return stats;
}

function createModeBySeed(seed) {
  if (seed === 1) return 'indoor';
  if (seed === 42) return 'greenhouse';
  if (seed === 123) return 'outdoor';
  return 'indoor';
}

function createRuntimeState(seed) {
  const nowMs = Date.now();
  const mode = createModeBySeed(seed);
  return {
    seed,
    setup: {
      mode,
      medium: mode === 'outdoor' ? 'soil' : 'coco',
      light: mode === 'indoor' ? 'high' : 'medium',
      potSize: 'medium',
      genetics: 'auto'
    },
    simulation: {
      nowMs,
      startRealTimeMs: nowMs,
      simEpochMs: nowMs,
      simTimeMs: nowMs,
      tickCount: 0,
      isDaytime: true
    },
    plant: {
      phase: 'seedling',
      stageIndex: 0,
      stageKey: 'stage_01',
      lifecycle: {
        qualityScore: 76
      }
    },
    status: {
      water: 70,
      nutrition: 68,
      health: 84,
      stress: 18,
      risk: 22,
      growth: 8
    },
    events: {
      scheduler: {
        nextEventRealTimeMs: nowMs + EVENT_ROLL_MIN_REAL_MS,
        eventCooldowns: {},
        categoryCooldowns: {},
        lastEventId: null,
        lastEventCategory: null
      },
      foundation: {
        flags: {},
        memory: { events: [], decisions: [], pendingChains: {} },
        analysis: []
      }
    }
  };
}

function updateSimulationAndPlant(runtimeState, nowMs) {
  const elapsedRealMs = Math.max(0, nowMs - runtimeState.simulation.startRealTimeMs);
  const runProgress = clamp(elapsedRealMs / REAL_RUN_DURATION_MS, 0, 1);
  const simElapsedMs = runProgress * TOTAL_LIFECYCLE_SIM_MS;
  runtimeState.simulation.nowMs = nowMs;
  runtimeState.simulation.simTimeMs = runtimeState.simulation.simEpochMs + simElapsedMs;
  runtimeState.simulation.isDaytime = isDaytime(runtimeState.simulation.simTimeMs);
  runtimeState.simulation.tickCount += 1;

  const phase = phaseByProgress(runProgress);
  runtimeState.plant.phase = phase;
  const stageIndex = clampInt(Math.floor(runProgress * 12), 0, 11);
  runtimeState.plant.stageIndex = stageIndex;
  runtimeState.plant.stageKey = stageAssetKeyForIndex(stageIndex);
  runtimeState.status.growth = round2(runProgress * 100);
}

function applyStatusDrift(runtimeState, elapsedMs) {
  const minutes = elapsedMs / 60_000;
  if (minutes <= 0) return;
  runtimeState.status.water = clamp(runtimeState.status.water - (0.33 * minutes), 0, 100);
  runtimeState.status.nutrition = clamp(runtimeState.status.nutrition - (0.16 * minutes), 0, 100);
  let stressDelta = 0.06 * minutes;
  if (runtimeState.status.water < 30) stressDelta += 0.42 * minutes;
  if (runtimeState.status.nutrition < 30) stressDelta += 0.32 * minutes;
  runtimeState.status.stress = clamp(runtimeState.status.stress + stressDelta, 0, 100);
  let riskDelta = 0.05 * minutes + ((runtimeState.status.stress / 100) * 0.22 * minutes);
  if (runtimeState.status.water > 90 || runtimeState.status.water < 18) riskDelta += 0.32 * minutes;
  runtimeState.status.risk = clamp(runtimeState.status.risk + riskDelta, 0, 100);
  let healthDelta = (-0.02 * minutes) - ((runtimeState.status.stress / 100) * 0.44 * minutes) - ((runtimeState.status.risk / 100) * 0.30 * minutes);
  runtimeState.status.health = clamp(runtimeState.status.health + healthDelta, 0, 100);
}

function eligibleEvents(runtimeState, catalog, nowMs) {
  return catalog.filter((eventDef) => {
    if (!eventDef || !eventDef.id) return false;
    if (!isEventPhaseAllowed(runtimeState, eventDef)) return false;
    const blockedUntil = Number(runtimeState.events.scheduler.eventCooldowns[eventDef.id] || 0);
    if (blockedUntil > nowMs) return false;
    const categoryKey = String(eventDef.category || 'generic');
    const categoryBlockedUntil = Number(runtimeState.events.scheduler.categoryCooldowns[categoryKey] || 0);
    if (categoryBlockedUntil > nowMs) return false;
    return evaluateEventTriggers(runtimeState, eventDef.triggers || {});
  }).sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function addCount(map, key, amount = 1) {
  const safeKey = String(key || 'unknown');
  map[safeKey] = Number(map[safeKey] || 0) + Number(amount || 0);
}

function simulateSeed(seed, catalog) {
  const runtimeState = createRuntimeState(seed);
  const eventsState = runtimeState.events;
  memoryApi.ensureMemory(eventsState);
  flagsApi.ensureFoundation(eventsState);
  analysisApi.ensureAnalysisStore(eventsState);

  const stats = {
    seed,
    mode: runtimeState.setup.mode,
    ticks: TICKS_PER_SEED,
    totalEventsTriggered: 0,
    eventPoolDistribution: {},
    eventFrequencyById: {},
    eventFrequencyByCategory: {},
    followUpChainsTriggered: 0,
    followUpChainsConsumed: 0,
    rareEventsTriggered: 0,
    averageMinutesBetweenEvents: 0,
    longestEventChain: 0,
    repeatedEvents: 0,
    eventsSuppressedByGuards: {
      phaseGuard: 0,
      repeatGuard: 0,
      frustrationGuard: 0,
      fellBackToOriginal: 0
    },
    eventsSelectedByResolver: {
      total: 0,
      forcedByPendingChainOrFlag: 0,
      forcedByResolverCandidate: 0,
      selectedFromResolverShapedPool: 0,
      fallbackLegacyWeighted: 0,
      resolverNoMatch: 0
    },
    poolRoutingDistribution: {},
    weightedSelectionDistribution: {},
    suppressedReasons: {
      nighttimeDeferral: 0,
      noEligibleEvents: 0
    },
    resolverTraceSummary: {
      pendingChainOverride: 0,
      forcedFlagOverride: 0,
      noCandidates: 0
    },
    timeline: {
      firstEventAtMs: null,
      lastEventAtMs: null
    }
  };

  let nowMs = runtimeState.simulation.nowMs;
  let lastProcessedMs = nowMs;
  let lastEventId = null;
  let lastEventAtMs = null;
  let currentChainLen = 0;
  let totalGapMs = 0;
  let gapCount = 0;

  for (let attempt = 0; attempt < TICKS_PER_SEED; attempt += 1) {
    const elapsedSinceLast = Math.max(0, nowMs - lastProcessedMs);
    applyStatusDrift(runtimeState, elapsedSinceLast);
    updateSimulationAndPlant(runtimeState, nowMs);

    if (!runtimeState.simulation.isDaytime) {
      stats.suppressedReasons.nighttimeDeferral += 1;
      nowMs = nextDaytimeRealMs(nowMs, runtimeState.simulation.simTimeMs);
      lastProcessedMs = runtimeState.simulation.nowMs;
      continue;
    }

    const eligible = eligibleEvents(runtimeState, catalog, nowMs);
    let selectedEvent = null;
    let selectedBy = 'none';
    let trace = {};
    let decision = { eventId: null, reason: 'no_match' };
    let normalizedState = null;
    if (eligible.length) {
      normalizedState = plantStateApi.buildNormalizedPlantState(runtimeState);
      const randomFn = () => deterministicUnit(seed, `resolver:${attempt}:${eventsState.foundation.memory.events.length}`);
      const sourceCandidates = eligible.map((eventDef) => ({
        eventId: String(eventDef && eventDef.id || ''),
        reason: 'eligible_catalog',
        priority: 20,
        isFollowUp: eventDef && eventDef.isFollowUp === true
      }));
      const traceResult = resolver.resolveNextEventWithTrace({
        state: normalizedState,
        flags: flagsApi.getActiveFlags(eventsState),
        memory: {
          getLastDecision: () => memoryApi.getLastDecision(eventsState),
          getLastEvents: (count) => memoryApi.getLastEvents(eventsState, count),
          getPendingChain: (chainId) => memoryApi.getPendingChain(eventsState, chainId),
          getPendingChains: () => memoryApi.getPendingChains(eventsState)
        },
        catalog,
        random: randomFn,
        sourceCandidates
      });

      trace = traceResult && traceResult.trace ? traceResult.trace : {};
      decision = traceResult && traceResult.decision ? traceResult.decision : { eventId: null, reason: 'no_match' };
      const originalCandidates = Array.isArray(trace.candidates) ? trace.candidates.length : 0;
      const afterPhase = Array.isArray(trace.afterPhaseGuard) ? trace.afterPhaseGuard.length : 0;
      const afterRepeat = Array.isArray(trace.afterRepeatGuard) ? trace.afterRepeatGuard.length : 0;
      const afterFrustration = Array.isArray(trace.afterFrustrationGuard) ? trace.afterFrustrationGuard.length : 0;
      stats.eventsSuppressedByGuards.phaseGuard += Math.max(0, originalCandidates - afterPhase);
      stats.eventsSuppressedByGuards.repeatGuard += Math.max(0, afterPhase - afterRepeat);
      stats.eventsSuppressedByGuards.frustrationGuard += Math.max(0, afterRepeat - afterFrustration);
      if (trace.fellBackToOriginal === true) stats.eventsSuppressedByGuards.fellBackToOriginal += 1;
      if (trace.pendingChainOverride === true) stats.resolverTraceSummary.pendingChainOverride += 1;
      if (trace.forcedByFlag) stats.resolverTraceSummary.forcedFlagOverride += 1;
      if (trace.poolReason === 'no_candidates') stats.resolverTraceSummary.noCandidates += 1;
      if (trace.selectedPool) addCount(stats.poolRoutingDistribution, trace.selectedPool, 1);

      const isHardResolverOverride = Boolean(trace.pendingChainOverride === true || trace.forcedByFlag);
      const directResolverAllowed = isHardResolverOverride || shouldUseResolverDirectPick(
        seed,
        nowMs,
        attempt,
        decision && decision.eventId
      );
      const forced = (decision && decision.eventId && directResolverAllowed)
        ? eligible.find((eventDef) => String(eventDef.id) === String(decision.eventId))
        : null;
      const allowShapedPool = !isHardResolverOverride && shouldUseResolverShapedPool(
        seed,
        nowMs,
        attempt,
        trace && trace.selectedPool
      );
      const resolverShapedPool = allowShapedPool ? buildResolverShapedPool(eligible, trace) : [];
      const legacyInputPool = resolverShapedPool.length ? resolverShapedPool : eligible;

      if (forced) {
        selectedEvent = forced;
        selectedBy = 'resolver';
        stats.eventsSelectedByResolver.total += 1;
        if (trace.pendingChainOverride === true || trace.forcedByFlag) {
          stats.eventsSelectedByResolver.forcedByPendingChainOrFlag += 1;
        } else {
          stats.eventsSelectedByResolver.forcedByResolverCandidate += 1;
        }
      } else {
        const legacyPick = selectLegacyWeighted(runtimeState, {
          lastEventId: runtimeState.events.scheduler.lastEventId,
          lastEventCategory: runtimeState.events.scheduler.lastEventCategory,
          history: runtimeState.events.history || []
        }, legacyInputPool, seed, `legacy_pick:${attempt}:${Math.floor(nowMs / EVENT_ROLL_MIN_REAL_MS)}`);
        selectedEvent = legacyPick.selected;
        selectedBy = resolverShapedPool.length ? 'resolver_shaped_legacy' : 'legacy';
        if (resolverShapedPool.length) {
          stats.eventsSelectedByResolver.selectedFromResolverShapedPool += 1;
        }
        stats.eventsSelectedByResolver.fallbackLegacyWeighted += 1;
        for (const [eventId, weight] of Object.entries(legacyPick.weights || {})) {
          addCount(stats.weightedSelectionDistribution, `legacy_weight:${eventId}`, weight);
        }
      }
    } else {
      stats.suppressedReasons.noEligibleEvents += 1;
      stats.eventsSelectedByResolver.resolverNoMatch += 1;
    }

    if (!selectedEvent) {
      nowMs += deterministicRange(seed, `retry_delay:${attempt}`, EVENT_RETRY_MIN_MS, EVENT_RETRY_MAX_MS);
      lastProcessedMs = runtimeState.simulation.nowMs;
      continue;
    }

    const poolName = resolver.inferCandidatePool({ eventId: selectedEvent.id }, catalog);
    addCount(stats.eventPoolDistribution, poolName, 1);
    addCount(stats.eventFrequencyById, selectedEvent.id, 1);
    addCount(stats.eventFrequencyByCategory, selectedEvent.category || 'generic', 1);
    if (String(poolName) === 'rare') stats.rareEventsTriggered += 1;
    if (lastEventId && lastEventId === selectedEvent.id) stats.repeatedEvents += 1;
    if (lastEventAtMs != null) {
      totalGapMs += Math.max(0, nowMs - lastEventAtMs);
      gapCount += 1;
    }

    const consumedPending = memoryApi.consumePendingChain(eventsState, selectedEvent.id);
    if (consumedPending) {
      stats.followUpChainsConsumed += 1;
      currentChainLen += 1;
    } else {
      currentChainLen = 0;
    }
    stats.longestEventChain = Math.max(stats.longestEventChain, currentChainLen);

    memoryApi.addEvent(eventsState, selectedEvent.id, {
      phase: runtimeState.plant.phase,
      reason: selectedBy === 'resolver' ? (decision.reason || 'resolver') : 'legacy_selection'
    });

    const optionList = Array.isArray(selectedEvent.options) ? selectedEvent.options : [];
    const option = optionList.length
      ? optionList[deterministicRange(seed, `option:${selectedEvent.id}:${attempt}`, 0, optionList.length - 1)]
      : { id: 'none', effects: {}, followUps: [] };

    applyEffects(runtimeState.status, option.effects || {});
    const followUpStats = applyFollowUps(eventsState, selectedEvent.id, option);
    stats.followUpChainsTriggered += followUpStats.chainsCreated;

    analysisApi.generateAndStoreAnalysis(eventsState, {
      eventId: selectedEvent.id,
      optionId: option.id,
      atRealTimeMs: nowMs,
      atSimTimeMs: runtimeState.simulation.simTimeMs,
      tick: runtimeState.simulation.tickCount,
      relatedFlags: flagsApi.getActiveFlags(eventsState),
      normalizedState
    });

    const eventCooldownMs = Math.round((Number(selectedEvent.cooldownRealMinutes) || 120) * 60 * 1000);
    runtimeState.events.scheduler.eventCooldowns[selectedEvent.id] = nowMs + eventCooldownMs;
    const categoryKey = String(selectedEvent.category || 'generic');
    const categoryCooldownMs = categoryKey === 'positive'
      ? Math.max(EVENT_COOLDOWN_MS, 45 * 60 * 1000)
      : EVENT_COOLDOWN_MS;
    runtimeState.events.scheduler.categoryCooldowns[categoryKey] = nowMs + categoryCooldownMs;
    runtimeState.events.scheduler.lastEventId = selectedEvent.id;
    runtimeState.events.scheduler.lastEventCategory = categoryKey;

    lastEventId = selectedEvent.id;
    lastEventAtMs = nowMs;
    stats.totalEventsTriggered += 1;
    if (stats.timeline.firstEventAtMs == null) stats.timeline.firstEventAtMs = nowMs;
    stats.timeline.lastEventAtMs = nowMs;

    for (const [eventId, weight] of Object.entries(trace.weights || {})) {
      addCount(stats.weightedSelectionDistribution, `resolver_weight:${eventId}`, weight);
    }
    if (trace.selectedPool) {
      addCount(stats.weightedSelectionDistribution, `pool_selected:${trace.selectedPool}`, 1);
    }

    nowMs += deterministicRange(seed, `event_delay:${attempt}`, EVENT_ROLL_MIN_REAL_MS, EVENT_ROLL_MAX_REAL_MS);
    lastProcessedMs = runtimeState.simulation.nowMs;
  }

  stats.averageMinutesBetweenEvents = gapCount ? round2((totalGapMs / gapCount) / 60_000) : 0;
  stats.pendingChainsRemaining = Object.keys(memoryApi.getPendingChains(eventsState) || {}).length;
  stats.activeFlags = flagsApi.getActiveFlags(eventsState);
  const resolverDrivenTotal = Number(stats.eventsSelectedByResolver.total || 0)
    + Number(stats.eventsSelectedByResolver.selectedFromResolverShapedPool || 0);
  stats.resolverInfluence = {
    resolverDrivenTotal,
    resolverDrivenSharePercent: stats.totalEventsTriggered
      ? round2((resolverDrivenTotal / stats.totalEventsTriggered) * 100)
      : 0
  };
  return stats;
}

function aggregate(allStats) {
  const summary = {
    seeds: allStats.map((entry) => entry.seed),
    totalEventsTriggered: 0,
    eventPoolDistribution: {},
    rareEventsTriggered: 0,
    averageMinutesBetweenEvents: 0,
    longestEventChain: 0,
    repeatedEvents: 0,
    followUpChainsTriggered: 0,
    followUpChainsConsumed: 0,
    eventsSelectedByResolver: {
      total: 0,
      forcedByPendingChainOrFlag: 0,
      forcedByResolverCandidate: 0,
      selectedFromResolverShapedPool: 0,
      fallbackLegacyWeighted: 0,
      resolverNoMatch: 0
    },
    resolverInfluence: {
      resolverDrivenTotal: 0,
      resolverDrivenSharePercent: 0
    }
  };

  for (const stats of allStats) {
    summary.totalEventsTriggered += stats.totalEventsTriggered;
    summary.rareEventsTriggered += stats.rareEventsTriggered;
    summary.longestEventChain = Math.max(summary.longestEventChain, stats.longestEventChain);
    summary.repeatedEvents += stats.repeatedEvents;
    summary.followUpChainsTriggered += stats.followUpChainsTriggered;
    summary.followUpChainsConsumed += stats.followUpChainsConsumed;
    for (const [pool, count] of Object.entries(stats.eventPoolDistribution || {})) {
      addCount(summary.eventPoolDistribution, pool, count);
    }
    for (const [key, value] of Object.entries(stats.eventsSelectedByResolver || {})) {
      summary.eventsSelectedByResolver[key] = Number(summary.eventsSelectedByResolver[key] || 0) + Number(value || 0);
    }
  }

  const avg = allStats.length
    ? allStats.reduce((sum, row) => sum + Number(row.averageMinutesBetweenEvents || 0), 0) / allStats.length
    : 0;
  summary.averageMinutesBetweenEvents = round2(avg);
  const resolverDrivenTotal = Number(summary.eventsSelectedByResolver.total || 0)
    + Number(summary.eventsSelectedByResolver.selectedFromResolverShapedPool || 0);
  summary.resolverInfluence = {
    resolverDrivenTotal,
    resolverDrivenSharePercent: summary.totalEventsTriggered
      ? round2((resolverDrivenTotal / summary.totalEventsTriggered) * 100)
      : 0
  };
  return summary;
}

function main() {
  const catalog = loadCatalog();
  const perSeed = SEEDS.map((seed) => simulateSeed(seed, catalog));
  const report = {
    generatedAt: new Date().toISOString(),
    simulationSpec: {
      ticksPerSeed: TICKS_PER_SEED,
      seeds: SEEDS,
      eventRollWindowMinutes: [30, 90],
      noEligibleRetrySeconds: [20, 90]
    },
    catalogSummary: {
      totalEvents: catalog.length,
      sourceVersions: [...new Set(catalog.map((eventDef) => eventDef.sourceVersion))],
      explicitRareEvents: catalog.filter((eventDef) => String(eventDef.pool || '').toLowerCase() === 'rare').map((eventDef) => eventDef.id)
    },
    perSeed,
    aggregate: aggregate(perSeed)
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)}`);
}

if (require.main === module) {
  main();
}
