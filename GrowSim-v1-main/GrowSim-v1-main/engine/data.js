import { compileTrigger } from './triggers.js';

const DEFAULT_RULES = Object.freeze({
  tick_seconds: 60,
  global_seed: 'growsim-seed-v1',
  spawn_budget_per_tick: 1,
  max_active_events: 2,
  difficulty_ramp_days: 21,
  ideal_bands: {
    water: { low: 55, high: 80 },
    nutrition: { low: 50, high: 85 }
  },
  stress_constants: {
    kW: 0.08,
    kN: 0.06,
    stress_recovery_per_tick: 0.12
  },
  health_constants: {
    damage_rate: 0.002,
    recovery_rate: 0.02
  }
});

const DEFAULT_STAGE = Object.freeze({
  id: 'default-stage',
  base_growth_per_tick: 0.05,
  threshold_points: 100,
  water_drain_per_tick: 0.1,
  nutrition_drain_per_tick: 0.08
});

async function loadJson(path, fallback) {
  try {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Cannot load ${path}`);
    const parsed = await response.json();
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (_error) {
    return fallback;
  }
}

function normalizeBand(rawBand, fallbackBand) {
  const low = Number.isFinite(rawBand?.low) ? Number(rawBand.low) : fallbackBand.low;
  const high = Number.isFinite(rawBand?.high) ? Number(rawBand.high) : fallbackBand.high;
  if (high <= low) {
    return { ...fallbackBand };
  }
  return { low, high };
}

function normalizeRules(raw) {
  const src = raw || {};

  const rules = {
    ...DEFAULT_RULES,
    ...src,
    ideal_bands: {
      water: normalizeBand(src?.ideal_bands?.water, DEFAULT_RULES.ideal_bands.water),
      nutrition: normalizeBand(src?.ideal_bands?.nutrition, DEFAULT_RULES.ideal_bands.nutrition)
    },
    stress_constants: {
      kW: Number.isFinite(src?.stress_constants?.kW) ? Number(src.stress_constants.kW) : DEFAULT_RULES.stress_constants.kW,
      kN: Number.isFinite(src?.stress_constants?.kN) ? Number(src.stress_constants.kN) : DEFAULT_RULES.stress_constants.kN,
      stress_recovery_per_tick: Number.isFinite(src?.stress_constants?.stress_recovery_per_tick)
        ? Number(src.stress_constants.stress_recovery_per_tick)
        : DEFAULT_RULES.stress_constants.stress_recovery_per_tick
    },
    health_constants: {
      damage_rate: Number.isFinite(src?.health_constants?.damage_rate)
        ? Number(src.health_constants.damage_rate)
        : DEFAULT_RULES.health_constants.damage_rate,
      recovery_rate: Number.isFinite(src?.health_constants?.recovery_rate)
        ? Number(src.health_constants.recovery_rate)
        : DEFAULT_RULES.health_constants.recovery_rate
    }
  };

  rules.tick_seconds = Number.isInteger(rules.tick_seconds) && rules.tick_seconds > 0 ? rules.tick_seconds : DEFAULT_RULES.tick_seconds;
  rules.global_seed = typeof rules.global_seed === 'string' && rules.global_seed ? rules.global_seed : DEFAULT_RULES.global_seed;
  rules.spawn_budget_per_tick = Number.isInteger(rules.spawn_budget_per_tick) && rules.spawn_budget_per_tick > 0 ? rules.spawn_budget_per_tick : DEFAULT_RULES.spawn_budget_per_tick;
  rules.max_active_events = Number.isInteger(rules.max_active_events) && rules.max_active_events > 0 ? rules.max_active_events : DEFAULT_RULES.max_active_events;
  rules.difficulty_ramp_days = Number.isFinite(rules.difficulty_ramp_days) && rules.difficulty_ramp_days > 0
    ? Number(rules.difficulty_ramp_days)
    : DEFAULT_RULES.difficulty_ramp_days;

  return rules;
}

function normalizeStages(raw) {
  const src = raw && Array.isArray(raw.stages) ? raw.stages : [];
  const stages = src
    .map((stage, index) => ({
      id: typeof stage?.id === 'string' && stage.id ? stage.id : `stage_${index}`,
      base_growth_per_tick: Number.isFinite(stage?.base_growth_per_tick) ? Number(stage.base_growth_per_tick) : DEFAULT_STAGE.base_growth_per_tick,
      threshold_points: Number.isFinite(stage?.threshold_points) ? Number(stage.threshold_points) : DEFAULT_STAGE.threshold_points,
      water_drain_per_tick: Number.isFinite(stage?.water_drain_per_tick) ? Number(stage.water_drain_per_tick) : DEFAULT_STAGE.water_drain_per_tick,
      nutrition_drain_per_tick: Number.isFinite(stage?.nutrition_drain_per_tick) ? Number(stage.nutrition_drain_per_tick) : DEFAULT_STAGE.nutrition_drain_per_tick
    }))
    .filter((stage) => stage.threshold_points > 0)
    .sort((a, b) => a.id.localeCompare(b.id));

  if (stages.length === 0) {
    return { stages: [{ ...DEFAULT_STAGE }] };
  }

  return { stages };
}

function normalizeEvents(raw, tickSeconds) {
  const src = raw && Array.isArray(raw.events) ? raw.events : [];
  const normalized = src
    .filter((event) => event && typeof event.id === 'string' && event.id.trim())
    .map((event) => ({
      id: String(event.id),
      priority: Number.isFinite(event.priority) ? Number(event.priority) : (Number.isFinite(event.severity) ? Number(event.severity) : 1),
      weight: Number.isFinite(event.weight) ? Number(event.weight) : 1,
      cooldown_ticks: Number.isInteger(event.cooldown_ticks)
        ? Math.max(0, event.cooldown_ticks)
        : Math.max(0, Math.floor((Number(event.cooldown_minutes) || 0) * 60 / tickSeconds)),
      duration_ticks: Number.isInteger(event.duration_ticks)
        ? Math.max(1, event.duration_ticks)
        : Math.max(1, Math.floor((Number(event.duration_minutes) || 1) * 60 / tickSeconds)),
      min_stage: Number.isInteger(event.min_stage) ? event.min_stage : null,
      max_stage: Number.isInteger(event.max_stage) ? event.max_stage : null,
      trigger: event.trigger || { all: [] }
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const event of normalized) {
    event.compiledTrigger = compileTrigger(event.trigger);
  }

  return { events: normalized };
}

export async function loadGameData() {
  const [rawRules, rawStages, rawEvents] = await Promise.all([
    loadJson('./data/rules.json', {}),
    loadJson('./data/stages.json', { stages: [] }),
    loadJson('./data/events.json', { events: [] })
  ]);

  const rules = normalizeRules(rawRules);
  const stages = normalizeStages(rawStages);
  const events = normalizeEvents(rawEvents, rules.tick_seconds);

  return { rules, stages, events };
}
