#!/usr/bin/env node
/* GrowSim local balance harness (deterministic, offline) */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ACTIONS_PATH = path.join(ROOT, 'data', 'actions.json');
const EVENTS_V2_PATH = path.join(ROOT, 'data', 'events.v2.json');

const TOTAL_SIM_DAYS = 56;
const SIM_MINUTES_TOTAL = TOTAL_SIM_DAYS * 24 * 60;
const TIME_COMPRESSION = 12; // 1 real minute = 12 sim minutes
const DAY_START = 6;
const NIGHT_START = 22;
const EVENT_MIN_REAL_MIN = 30;
const EVENT_MAX_REAL_MIN = 90;

const STAGE_THRESHOLDS = [0, 2, 5, 10, 15, 20, 25, 30, 36, 42, 48, 54];

function parseArgs(argv) {
  const out = { runs: 20, strategy: 'careful', seed: null };
  for (let i = 2; i < argv.length; i += 1) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--runs') out.runs = Math.max(1, Number(v) || 20);
    if (k === '--strategy') out.strategy = String(v || 'careful').toLowerCase();
    if (k === '--seed') out.seed = String(v);
  }
  return out;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function hashString(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function deterministicUnit(seed, key) {
  const h = hashString(`${seed}|${key}`);
  return (h % 1_000_000) / 1_000_000;
}

function pickWeightedDeterministic(items, seed, key) {
  if (!items.length) return null;
  const total = items.reduce((s, it) => s + Math.max(0.01, Number(it.weight) || 1), 0);
  let cursor = deterministicUnit(seed, key) * total;
  for (const it of items) {
    cursor -= Math.max(0.01, Number(it.weight) || 1);
    if (cursor <= 0) return it;
  }
  return items[items.length - 1];
}

function simDay(state) {
  return state.simulation.simMinutes / (24 * 60);
}

function simHour(state) {
  return Math.floor((state.simulation.simMinutes % (24 * 60)) / 60);
}

function isDaytime(state) {
  const h = simHour(state);
  return h >= DAY_START && h < NIGHT_START;
}

function stageIndexForDay(day) {
  let idx = 1;
  for (let i = 0; i < STAGE_THRESHOLDS.length; i += 1) {
    if (day >= STAGE_THRESHOLDS[i]) idx = i + 1;
  }
  return clamp(idx, 1, 12);
}

function evaluateTriggerCondition(state, c) {
  const lhs = resolveField(state, c.field);
  const rhs = c.value;
  const op = c.op;
  if (op === 'in') return Array.isArray(rhs) && rhs.map(String).includes(String(lhs));
  if (op === 'not_in') return Array.isArray(rhs) && !rhs.map(String).includes(String(lhs));
  if (op === '==') return String(lhs) === String(rhs);
  if (op === '!=') return String(lhs) !== String(rhs);
  const a = Number(lhs);
  const b = Number(rhs);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (op === '>') return a > b;
  if (op === '>=') return a >= b;
  if (op === '<') return a < b;
  if (op === '<=') return a <= b;
  return false;
}

function resolveField(state, field) {
  if (!field) return undefined;
  if (field.startsWith('status.')) return state.status[field.split('.').pop()];
  if (field === 'plant.stageIndex') return state.plant.stageIndex;
  if (field === 'plant.stageKey') return state.plant.stageKey;
  if (field.startsWith('setup.')) return state.setup[field.split('.').pop()];
  if (field === 'simulation.isDaytime') return state.simulation.isDaytime;
  if (field.startsWith('state.status.')) return state.status[field.split('.').pop()];
  if (field === 'state.plant.stageIndex') return state.plant.stageIndex;
  if (field === 'state.plant.stageKey') return state.plant.stageKey;
  if (field.startsWith('state.setup.')) return state.setup[field.split('.').pop()];
  if (field === 'state.simulation.isDaytime') return state.simulation.isDaytime;
  return undefined;
}

function eventEligible(state, ev) {
  if (state.events.cooldowns[ev.id] > state.simulation.realMinutes) return false;
  const t = ev.triggers || {};
  if (t.stage) {
    if (Number.isFinite(Number(t.stage.min)) && state.plant.stageIndex < Number(t.stage.min)) return false;
    if (Number.isFinite(Number(t.stage.max)) && state.plant.stageIndex > Number(t.stage.max)) return false;
  }
  if (t.setup) {
    for (const [k, vals] of Object.entries(t.setup)) {
      const prop = k.replace(/In$/, '');
      if (Array.isArray(vals) && !vals.map(String).includes(String(state.setup[prop]))) return false;
    }
  }
  const all = Array.isArray(t.all) ? t.all : [];
  const any = Array.isArray(t.any) ? t.any : [];
  if (all.length && !all.every((c) => evaluateTriggerCondition(state, c))) return false;
  if (any.length && !any.some((c) => evaluateTriggerCondition(state, c))) return false;
  return true;
}

function applyEffects(state, effects) {
  for (const [k, v] of Object.entries(effects || {})) {
    const d = Number(v);
    if (!Number.isFinite(d)) continue;
    if (k in state.status) state.status[k] = clamp(state.status[k] + d, 0, 100);
  }
}

function chooseOption(state, ev, strategy, seedKey) {
  const opts = ev.options || [];
  if (!opts.length) return null;
  const scoreOption = (opt) => {
    const e = opt.effects || {};
    if (strategy === 'aggressive') return (e.growth || 0) * 2.4 + (e.health || 0) - (e.stress || 0) * 0.9 - (e.risk || 0) * 0.9;
    if (strategy === 'neglect') return -((e.stress || 0) + (e.risk || 0));
    // careful: strongly prioritize low stress/risk and stable health
    return (e.health || 0) * 2.2 - (e.stress || 0) * 3.6 - (e.risk || 0) * 3.2 + (e.water || 0) * 0.25 + (e.nutrition || 0) * 0.25;
  };
  const sorted = opts.slice().sort((a, b) => scoreOption(b) - scoreOption(a) || a.id.localeCompare(b.id));
  if (strategy === 'neglect') {
    const u = deterministicUnit(seedKey, `opt:${ev.id}:${state.simulation.realMinutes}`);
    if (u < 0.7) return sorted[sorted.length - 1];
  }
  return sorted[0];
}

function chooseAction(state, actionsByCat, strategy, seed) {
  const s = state.status;
  const tryPick = (cat, intensityPref) => {
    const list = (actionsByCat[cat] || []).slice().sort((a, b) => a.id.localeCompare(b.id));
    const candidates = intensityPref ? list.filter((a) => a.intensity === intensityPref) : list;
    for (const a of candidates) {
      if ((state.actions.cooldowns[a.id] || 0) > state.simulation.realMinutes) continue;
      if (!prereqOk(state, a)) continue;
      return a;
    }
    return null;
  };

  if (strategy === 'neglect') {
    const u = deterministicUnit(seed, `neglect_act:${state.simulation.realMinutes}`);
    if (u < 0.92) return null;
  }

  if (strategy === 'careful') {
    if (s.stress > 22 || s.risk > 28) return tryPick('environment', 'low') || tryPick('environment', 'medium') || tryPick('environment');
    if (s.water < 58) return tryPick('watering', 'low') || tryPick('watering', 'medium') || tryPick('watering');
    if (s.nutrition < 58) return tryPick('fertilizing', 'low') || tryPick('fertilizing', 'medium') || tryPick('fertilizing');
    return tryPick('environment', 'low') || tryPick('watering', 'low') || null;
  }

  if (s.water < 45) return tryPick('watering', strategy === 'aggressive' ? 'high' : 'medium') || tryPick('watering');
  if (s.nutrition < 45) return tryPick('fertilizing', strategy === 'aggressive' ? 'high' : 'medium') || tryPick('fertilizing');
  if (s.stress > 55 || s.risk > 55) return tryPick('environment', strategy === 'aggressive' ? 'medium' : 'low') || tryPick('environment');
  if (strategy === 'aggressive') return tryPick('training', 'high') || tryPick('training', 'medium');
  return null;
}

function prereqOk(state, action) {
  const min = action.prerequisites?.min || {};
  const max = action.prerequisites?.max || {};
  for (const [k, v] of Object.entries(min)) if (k in state.status && state.status[k] < Number(v)) return false;
  for (const [k, v] of Object.entries(max)) if (k in state.status && state.status[k] > Number(v)) return false;
  if (action.trigger?.timeWindow === 'daytime_only' && !state.simulation.isDaytime) return false;
  if (Number.isFinite(Number(action.trigger?.minStageIndex)) && state.plant.stageIndex < Number(action.trigger.minStageIndex)) return false;
  return true;
}

function newState(seed, strategy) {
  return {
    seed,
    strategy,
    setup: { mode: 'indoor', light: 'medium', medium: 'soil', potSize: 'medium', genetics: 'auto' },
    simulation: { realMinutes: 0, simMinutes: 8 * 60, isDaytime: true },
    plant: { stageIndex: 1, stageKey: 'stage_01', qualityTier: 'normal' },
    status: { water: 70, nutrition: 65, health: 85, stress: 15, risk: 20, growth: 10 },
    events: { total: 0, byCategory: {}, byId: {}, lastCategory: null, cooldowns: {} },
    actions: { total: 0, byCategory: {}, byIntensity: {}, cooldowns: {}, activeEffects: [], cooldownBlocks: 0 },
    metrics: { sumHealth: 0, sumStress: 0, sumRisk: 0, samples: 0, maxStress: 0, maxRisk: 0 }
  };
}

function updateStageAndQuality(state) {
  const d = simDay(state);
  state.plant.stageIndex = stageIndexForDay(d);
  state.plant.stageKey = `stage_${String(state.plant.stageIndex).padStart(2, '0')}`;
  const avgH = state.metrics.samples ? state.metrics.sumHealth / state.metrics.samples : state.status.health;
  const avgS = state.metrics.samples ? state.metrics.sumStress / state.metrics.samples : state.status.stress;
  if (avgH >= 80 && avgS <= 30 && state.status.stress <= 30) state.plant.qualityTier = 'perfect';
  else if (avgH < 50 || avgS >= 50 || state.status.stress >= 65) state.plant.qualityTier = 'degraded';
  else state.plant.qualityTier = 'normal';
}

function applyOvertime(state, simMinutesStep) {
  const still = [];
  for (const eff of state.actions.activeEffects) {
    const step = Math.min(simMinutesStep, eff.remaining);
    const hours = step / 60;
    for (const [k, v] of Object.entries(eff.rates || {})) {
      const val = Number(v) * hours;
      if (!Number.isFinite(val)) continue;
      const m = k.replace(/PerHour$/, '');
      if (m in state.status) state.status[m] = clamp(state.status[m] + val, 0, 100);
    }
    eff.remaining -= step;
    if (eff.remaining > 0) still.push(eff);
  }
  state.actions.activeEffects = still;
}

function runOne(seed, strategy, actions, events) {
  const state = newState(seed, strategy);

  const byCat = {};
  for (const a of actions) {
    const cat = a.category || 'misc';
    byCat[cat] = byCat[cat] || [];
    byCat[cat].push(a);
  }

  let nextEventAt = EVENT_MIN_REAL_MIN + Math.floor(deterministicUnit(seed, 'first_event') * (EVENT_MAX_REAL_MIN - EVENT_MIN_REAL_MIN));

  while (state.simulation.simMinutes < SIM_MINUTES_TOTAL + (8 * 60)) {
    state.simulation.realMinutes += 1;
    state.simulation.simMinutes += TIME_COMPRESSION;
    state.simulation.isDaytime = isDaytime(state);

    applyOvertime(state, TIME_COMPRESSION);

    // passive drift with recovery band
    state.status.water = clamp(state.status.water - 0.028 * TIME_COMPRESSION, 0, 100);
    state.status.nutrition = clamp(state.status.nutrition - 0.008 * TIME_COMPRESSION, 0, 100);

    const inRecoveryBand = (
      state.status.water >= 45 && state.status.water <= 72 &&
      state.status.nutrition >= 45 && state.status.nutrition <= 72 &&
      state.status.stress < 42
    );

    let stressDelta = (state.simulation.isDaytime ? 0.0008 : -0.0014) * TIME_COMPRESSION;
    if (inRecoveryBand) stressDelta -= 0.0038 * TIME_COMPRESSION;
    if (state.status.water < 30) stressDelta += 0.0055 * TIME_COMPRESSION;
    if (state.status.nutrition < 30) stressDelta += 0.0048 * TIME_COMPRESSION;
    state.status.stress = clamp(state.status.stress + stressDelta, 0, 100);

    let riskDelta = (state.status.stress > 60 ? 0.0026 : 0.0006) * TIME_COMPRESSION;
    if (inRecoveryBand) riskDelta -= 0.0023 * TIME_COMPRESSION;
    if (state.status.water > 88 || state.status.water < 18) riskDelta += 0.0032 * TIME_COMPRESSION;
    state.status.risk = clamp(state.status.risk + riskDelta, 0, 100);

    let healthDelta = -0.0004 * TIME_COMPRESSION;
    healthDelta -= (state.status.stress / 100) * 0.0032 * TIME_COMPRESSION;
    healthDelta -= (state.status.risk / 100) * 0.0027 * TIME_COMPRESSION;
    if (inRecoveryBand && state.status.risk <= 45) {
      healthDelta += 0.0078 * TIME_COMPRESSION;
    }
    state.status.health = clamp(state.status.health + healthDelta, 0, 100);

    state.status.growth = clamp(state.status.growth + (state.status.health > 70 ? 0.01 : -0.004) * TIME_COMPRESSION, 0, 100);

    const actionInterval = strategy === 'careful' ? 10 : 30;
    if (state.simulation.realMinutes % actionInterval === 0) {
      const action = chooseAction(state, byCat, strategy, seed);
      if (action) {
        if ((state.actions.cooldowns[action.id] || 0) > state.simulation.realMinutes) {
          state.actions.cooldownBlocks += 1;
        } else {
          applyEffects(state, action.effects?.immediate || {});
          const dur = Number(action.effects?.durationSimMinutes || 0);
          if (dur > 0 && action.effects?.overTime) state.actions.activeEffects.push({ remaining: dur, rates: action.effects.overTime });
          state.actions.cooldowns[action.id] = state.simulation.realMinutes + Number(action.cooldownRealMinutes || 0);
          state.actions.total += 1;
          state.actions.byCategory[action.category] = (state.actions.byCategory[action.category] || 0) + 1;
          state.actions.byIntensity[action.intensity] = (state.actions.byIntensity[action.intensity] || 0) + 1;
        }
      }
    }

    // event roll
    if (state.simulation.realMinutes >= nextEventAt) {
      let eligible = events.filter((ev) => eventEligible(state, ev));
      if (state.events.lastCategory) {
        const alt = eligible.filter((e) => e.category !== state.events.lastCategory);
        if (alt.length) eligible = alt;
      }
      if (state.simulation.isDaytime && eligible.length) {
        eligible.sort((a, b) => a.id.localeCompare(b.id));
        const ev = pickWeightedDeterministic(eligible, seed, `pick:${state.simulation.realMinutes}:${simDay(state).toFixed(2)}`);
        const opt = chooseOption(state, ev, strategy, seed);
        if (ev && opt) {
          applyEffects(state, opt.effects || {});
          // deterministic side effects
          for (const se of (opt.sideEffects || [])) {
            const chance = clamp(Number(se.chance || 0), 0, 1);
            const roll = deterministicUnit(seed, `side:${ev.id}:${opt.id}:${se.id || 'x'}:${state.simulation.realMinutes}`);
            if (roll <= chance) applyEffects(state, se.effects || se.deltas || {});
          }
          state.events.total += 1;
          state.events.byCategory[ev.category] = (state.events.byCategory[ev.category] || 0) + 1;
          state.events.byId[ev.id] = (state.events.byId[ev.id] || 0) + 1;
          state.events.lastCategory = ev.category;
          state.events.cooldowns[ev.id] = state.simulation.realMinutes + Number(ev.cooldownRealMinutes || 120);
        }
      }
      nextEventAt = state.simulation.realMinutes + EVENT_MIN_REAL_MIN + Math.floor(deterministicUnit(seed, `event_delay:${state.simulation.realMinutes}`) * (EVENT_MAX_REAL_MIN - EVENT_MIN_REAL_MIN));
      if (!state.simulation.isDaytime) {
        while (!state.simulation.isDaytime) {
          state.simulation.realMinutes += 1;
          state.simulation.simMinutes += TIME_COMPRESSION;
          state.simulation.isDaytime = isDaytime(state);
        }
      }
    }

    updateStageAndQuality(state);

    state.metrics.samples += 1;
    state.metrics.sumHealth += state.status.health;
    state.metrics.sumStress += state.status.stress;
    state.metrics.sumRisk += state.status.risk;
    state.metrics.maxStress = Math.max(state.metrics.maxStress, state.status.stress);
    state.metrics.maxRisk = Math.max(state.metrics.maxRisk, state.status.risk);
  }

  const topEventIds = Object.entries(state.events.byId).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return {
    seed,
    strategy,
    finalQualityTier: state.plant.qualityTier,
    finalStageReached: state.plant.stageIndex,
    totalEventsTriggered: state.events.total,
    eventsPerCategory: state.events.byCategory,
    totalActionsTaken: state.actions.total,
    actionsPerCategory: state.actions.byCategory,
    actionsPerIntensity: state.actions.byIntensity,
    avgHealth: round2(state.metrics.sumHealth / state.metrics.samples),
    avgStress: round2(state.metrics.sumStress / state.metrics.samples),
    avgRisk: round2(state.metrics.sumRisk / state.metrics.samples),
    maxStress: round2(state.metrics.maxStress),
    maxRisk: round2(state.metrics.maxRisk),
    cooldownBlocks: state.actions.cooldownBlocks,
    topEventIds
  };
}

function median(nums) {
  if (!nums.length) return 0;
  const a = nums.slice().sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function aggregate(results) {
  const tiers = {};
  const events = [];
  const stress = [];
  const health = [];
  for (const r of results) {
    tiers[r.finalQualityTier] = (tiers[r.finalQualityTier] || 0) + 1;
    events.push(r.totalEventsTriggered);
    stress.push(r.avgStress);
    health.push(r.avgHealth);
  }
  const mean = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
  return {
    qualityTierDistribution: tiers,
    meanEventsPerRun: round2(mean(events)),
    medianEventsPerRun: round2(median(events)),
    meanStress: round2(mean(stress)),
    medianStress: round2(median(stress)),
    meanHealth: round2(mean(health)),
    medianHealth: round2(median(health))
  };
}

function main() {
  const args = parseArgs(process.argv);
  const actionsPayload = readJson(ACTIONS_PATH);
  const actions = Array.isArray(actionsPayload) ? actionsPayload : (actionsPayload.actions || []);
  const eventsPayload = readJson(EVENTS_V2_PATH);
  const events = Array.isArray(eventsPayload) ? eventsPayload : (eventsPayload.events || []);

  const runs = [];
  for (let i = 0; i < args.runs; i += 1) {
    const seed = args.seed ? `${args.seed}:${i}` : `seed-${args.strategy}-${i}`;
    runs.push(runOne(seed, args.strategy, actions, events));
  }

  for (const r of runs) {
    console.log('--- RUN ---');
    console.log(JSON.stringify(r, null, 2));
  }

  console.log('=== AGGREGATE ===');
  console.log(JSON.stringify(aggregate(runs), null, 2));
}

if (require.main === module) {
  main();
}
