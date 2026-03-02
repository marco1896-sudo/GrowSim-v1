import { compileTrigger } from './triggers.js';

const DEFAULT_RULES = Object.freeze({
  tick_seconds: 60,
  global_seed: 'growsim-seed-v1',
  spawn_budget_per_tick: 1,
  max_active_events: 2
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

function normalizeRules(raw) {
  const rules = { ...DEFAULT_RULES, ...(raw || {}) };
  rules.tick_seconds = Number.isInteger(rules.tick_seconds) && rules.tick_seconds > 0 ? rules.tick_seconds : DEFAULT_RULES.tick_seconds;
  rules.global_seed = typeof rules.global_seed === 'string' && rules.global_seed ? rules.global_seed : DEFAULT_RULES.global_seed;
  rules.spawn_budget_per_tick = Number.isInteger(rules.spawn_budget_per_tick) && rules.spawn_budget_per_tick > 0 ? rules.spawn_budget_per_tick : DEFAULT_RULES.spawn_budget_per_tick;
  rules.max_active_events = Number.isInteger(rules.max_active_events) && rules.max_active_events > 0 ? rules.max_active_events : DEFAULT_RULES.max_active_events;
  return rules;
}

function normalizeStages(raw) {
  const src = raw && Array.isArray(raw.stages) ? raw.stages : [];
  return { stages: src };
}

function normalizeEvents(raw) {
  const src = raw && Array.isArray(raw.events) ? raw.events : [];
  const normalized = src
    .filter((event) => event && typeof event.id === 'string' && event.id.trim())
    .map((event) => ({
      id: String(event.id),
      priority: Number.isFinite(event.priority) ? Number(event.priority) : (Number.isFinite(event.severity) ? Number(event.severity) : 1),
      weight: Number.isFinite(event.weight) ? Number(event.weight) : 1,
      cooldown_ticks: Number.isInteger(event.cooldown_ticks)
        ? Math.max(0, event.cooldown_ticks)
        : Math.max(0, Math.floor((Number(event.cooldown_minutes) || 0) * 60 / DEFAULT_RULES.tick_seconds)),
      duration_ticks: Number.isInteger(event.duration_ticks)
        ? Math.max(1, event.duration_ticks)
        : Math.max(1, Math.floor((Number(event.duration_minutes) || 1) * 60 / DEFAULT_RULES.tick_seconds)),
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
  const events = normalizeEvents(rawEvents);

  // Recompute event tick defaults with effective rules.tick_seconds
  for (const event of events.events) {
    if (!Number.isInteger(event.cooldown_ticks) || event.cooldown_ticks < 0) {
      event.cooldown_ticks = 0;
    }
    if (!Number.isInteger(event.duration_ticks) || event.duration_ticks < 1) {
      event.duration_ticks = 1;
    }
  }

  return { rules, stages, events };
}
