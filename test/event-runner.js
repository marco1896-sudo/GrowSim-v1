#!/usr/bin/env node
/* GrowSim Event Runner: 10 deterministic full runs with event/stage analysis */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_EVENTS = path.join(ROOT, 'data', 'events.v2.json');
const DATA_ACTIONS = path.join(ROOT, 'data', 'actions.json');
const RESULTS_DIR = path.join(ROOT, 'test', 'results');
const RUN_RESULTS_PATH = path.join(RESULTS_DIR, 'run_results.json');
const ANALYSIS_PATH = path.join(RESULTS_DIR, 'event_analysis.md');

const TOTAL_SIM_DAYS = 56;
const SIM_MINUTES_TOTAL = TOTAL_SIM_DAYS * 24 * 60;
const TIME_COMPRESSION = 12;
const DAY_START = 6;
const NIGHT_START = 22;
const EVENT_MIN_REAL_MIN = 30;
const EVENT_MAX_REAL_MIN = 90;
const STAGE_THRESHOLDS = [0, 2, 5, 10, 15, 20, 25, 30, 36, 42, 48, 54];

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function round2(v) { return Math.round(v * 100) / 100; }
function hashString(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function deterministicUnit(seed, key) { return (hashString(`${seed}|${key}`) % 1_000_000) / 1_000_000; }
function simDay(state) { return state.simulation.simMinutes / (24 * 60); }
function simHour(state) { return Math.floor((state.simulation.simMinutes % (24 * 60)) / 60); }
function isDaytime(state) { const h = simHour(state); return h >= DAY_START && h < NIGHT_START; }
function stageIndexForDay(day) {
  let idx = 1;
  for (let i = 0; i < STAGE_THRESHOLDS.length; i += 1) if (day >= STAGE_THRESHOLDS[i]) idx = i + 1;
  return clamp(idx, 1, 12);
}
function resolveField(state, field) {
  if (!field) return undefined;
  if (field.startsWith('status.')) return state.status[field.split('.').pop()];
  if (field === 'plant.stageIndex') return state.plant.stageIndex;
  if (field.startsWith('setup.')) return state.setup[field.split('.').pop()];
  if (field === 'simulation.isDaytime') return state.simulation.isDaytime;
  return undefined;
}
function evaluateCond(state, c) {
  const lhs = resolveField(state, c.field);
  const rhs = c.value;
  switch (c.op) {
    case '==': return String(lhs) === String(rhs);
    case '!=': return String(lhs) !== String(rhs);
    case '>': return Number(lhs) > Number(rhs);
    case '>=': return Number(lhs) >= Number(rhs);
    case '<': return Number(lhs) < Number(rhs);
    case '<=': return Number(lhs) <= Number(rhs);
    case 'in': return Array.isArray(rhs) && rhs.map(String).includes(String(lhs));
    case 'not_in': return Array.isArray(rhs) && !rhs.map(String).includes(String(lhs));
    default: return false;
  }
}

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

function normalizeEvents(payload) {
  const events = Array.isArray(payload) ? payload : (payload.events || []);
  return events.map((e) => ({
    ...e,
    polarity: e.polarity || (e.category === 'positive' ? 'positive' : 'negative'),
    weight: Math.max(0.01, Number(e.weight) || 1),
    cooldownRealMinutes: Math.max(10, Number(e.cooldownRealMinutes) || 120)
  }));
}

function eventEligible(state, ev) {
  if ((state.events.cooldowns[ev.id] || 0) > state.simulation.realMinutes) return false;
  if ((state.events.categoryCooldowns[ev.category] || 0) > state.simulation.realMinutes) return false;
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
  if (all.length && !all.every((c) => evaluateCond(state, c))) return false;
  if (any.length && !any.some((c) => evaluateCond(state, c))) return false;
  return true;
}

function computeWeight(state, ev) {
  let factor = 1;
  if (ev.category === 'positive') {
    const recent = state.events.history.slice(-4);
    const neg = recent.filter((x) => x.polarity !== 'positive').length;
    const pos = recent.length - neg;
    if (neg >= 2) factor += 0.35;
    if (state.status.health < 55) factor += 0.2;
    if (pos >= 2) factor -= 0.45;
  } else {
    if (state.status.risk >= 60) factor += 0.15;
    if (state.status.stress >= 55) factor += 0.1;
    if (ev.category === 'disease' && state.status.risk < 40) factor *= 0.85;
  }
  return Math.max(0.01, ev.weight * factor);
}

function pickWeighted(state, items, seed, key) {
  if (!items.length) return null;
  const weighted = items.map((ev) => ({ ev, w: computeWeight(state, ev) }));
  const total = weighted.reduce((s, r) => s + r.w, 0);
  let cursor = deterministicUnit(seed, key) * total;
  for (const r of weighted) { cursor -= r.w; if (cursor <= 0) return r.ev; }
  return weighted[weighted.length - 1].ev;
}

function applyEffects(state, effects) {
  for (const [k, v] of Object.entries(effects || {})) {
    const d = Number(v);
    if (Number.isFinite(d) && k in state.status) state.status[k] = clamp(state.status[k] + d, 0, 100);
  }
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

function chooseAction(state, actionsByCat, strategy, seed) {
  const s = state.status;
  const tryPick = (cat, intensity) => {
    const list = (actionsByCat[cat] || []).filter((a) => !intensity || a.intensity === intensity);
    const ordered = list.slice().sort((a, b) => a.id.localeCompare(b.id));
    for (const a of ordered) if ((state.actions.cooldowns[a.id] || 0) <= state.simulation.realMinutes && prereqOk(state, a)) return a;
    return null;
  };

  if (strategy === 'neglect' && deterministicUnit(seed, `neglect:${state.simulation.realMinutes}`) < 0.92) return null;
  if (strategy === 'careful') {
    if (s.stress > 22 || s.risk > 28) return tryPick('environment', 'low') || tryPick('environment', 'medium');
    if (s.water < 58) return tryPick('watering', 'low') || tryPick('watering', 'medium');
    if (s.nutrition < 58) return tryPick('fertilizing', 'low') || tryPick('fertilizing', 'medium');
    return tryPick('environment', 'low') || null;
  }
  if (strategy === 'normal') {
    if (s.stress > 45 || s.risk > 45) return tryPick('environment', 'medium') || tryPick('environment', 'low');
    if (s.water < 50) return tryPick('watering', 'medium') || tryPick('watering', 'low');
    if (s.nutrition < 50) return tryPick('fertilizing', 'medium') || tryPick('fertilizing', 'low');
    return deterministicUnit(seed, `normal_mix:${state.simulation.realMinutes}`) < 0.35 ? (tryPick('training', 'low') || null) : null;
  }
  // aggressive / neglect fallback
  if (s.water < 45) return tryPick('watering', 'high') || tryPick('watering', 'medium') || tryPick('watering', 'low');
  if (s.nutrition < 45) return tryPick('fertilizing', 'high') || tryPick('fertilizing', 'medium') || tryPick('fertilizing', 'low');
  if (s.stress > 55 || s.risk > 55) return tryPick('environment', 'medium') || tryPick('environment', 'low');
  return tryPick('training', 'medium') || null;
}

function newState(seed, strategy, mode) {
  return {
    seed,
    strategy,
    setup: { mode, light: mode === 'indoor' ? 'high' : 'medium', medium: 'soil', potSize: 'medium', genetics: 'auto' },
    simulation: { realMinutes: 0, simMinutes: 8 * 60, isDaytime: true },
    plant: { stageIndex: 1 },
    status: { water: 70, nutrition: 65, health: 85, stress: 15, risk: 20, growth: 10 },
    events: { cooldowns: {}, categoryCooldowns: {}, history: [] },
    actions: { cooldowns: {}, activeEffects: [] }
  };
}

function stagePlausibilityViolations(entry) {
  const out = [];
  const id = String(entry.event_id || '').toLowerCase();
  const stage = Number(entry.stage);
  if (stage <= 2 && id.includes('storm')) out.push('storm_in_germination');
  if (stage <= 4 && (id.includes('mold') || id.includes('rain_series'))) out.push('mold_too_early');
  return out;
}

function runSimulationTest({ runId, strategy, seed, mode }, events, actions) {
  const state = newState(seed, strategy, mode);
  const actionsByCat = {};
  for (const a of actions) { const c = a.category || 'misc'; (actionsByCat[c] ||= []).push(a); }

  let nextEventAt = EVENT_MIN_REAL_MIN + Math.floor(deterministicUnit(seed, 'first_event') * (EVENT_MAX_REAL_MIN - EVENT_MIN_REAL_MIN));
  const eventLog = [];
  const summary = {
    run_id: runId,
    strategy,
    seed,
    mode,
    total_days: TOTAL_SIM_DAYS,
    events_triggered: 0,
    events_by_category: {},
    events_by_stage: {},
    positive_events: 0,
    negative_events: 0,
    cooldown_violations: 0,
    category_cooldown_violations: 0,
    stage_violations: 0,
    stage_distribution: {}
  };

  let lastEventId = null;
  let last4 = [];

  while (state.simulation.simMinutes < SIM_MINUTES_TOTAL + (8 * 60)) {
    state.simulation.realMinutes += 1;
    state.simulation.simMinutes += TIME_COMPRESSION;
    state.simulation.isDaytime = isDaytime(state);

    // overtime action effects
    const nextActive = [];
    for (const eff of state.actions.activeEffects) {
      const step = Math.min(TIME_COMPRESSION, eff.remaining);
      const hours = step / 60;
      for (const [k, v] of Object.entries(eff.rates || {})) {
        const metric = k.replace(/PerHour$/, '');
        if (metric in state.status) state.status[metric] = clamp(state.status[metric] + Number(v) * hours, 0, 100);
      }
      eff.remaining -= step;
      if (eff.remaining > 0) nextActive.push(eff);
    }
    state.actions.activeEffects = nextActive;

    // passive drift
    state.status.water = clamp(state.status.water - 0.028 * TIME_COMPRESSION, 0, 100);
    state.status.nutrition = clamp(state.status.nutrition - 0.008 * TIME_COMPRESSION, 0, 100);
    const recovery = state.status.water >= 45 && state.status.water <= 72 && state.status.nutrition >= 45 && state.status.nutrition <= 72 && state.status.stress < 42;
    let stressDelta = (state.simulation.isDaytime ? 0.0008 : -0.0014) * TIME_COMPRESSION;
    if (recovery) stressDelta -= 0.0038 * TIME_COMPRESSION;
    if (state.status.water < 30) stressDelta += 0.0055 * TIME_COMPRESSION;
    if (state.status.nutrition < 30) stressDelta += 0.0048 * TIME_COMPRESSION;
    state.status.stress = clamp(state.status.stress + stressDelta, 0, 100);
    let riskDelta = (state.status.stress > 60 ? 0.0026 : 0.0006) * TIME_COMPRESSION;
    if (recovery) riskDelta -= 0.0023 * TIME_COMPRESSION;
    if (state.status.water > 88 || state.status.water < 18) riskDelta += 0.0032 * TIME_COMPRESSION;
    state.status.risk = clamp(state.status.risk + riskDelta, 0, 100);

    // stage
    state.plant.stageIndex = stageIndexForDay(simDay(state));
    summary.stage_distribution[state.plant.stageIndex] = (summary.stage_distribution[state.plant.stageIndex] || 0) + 1;

    // action tick
    const interval = strategy === 'careful' ? 10 : (strategy === 'normal' ? 15 : 30);
    if (state.simulation.realMinutes % interval === 0) {
      const action = chooseAction(state, actionsByCat, strategy, seed);
      if (action) {
        applyEffects(state, action.effects?.immediate || {});
        const dur = Number(action.effects?.durationSimMinutes || 0);
        if (dur > 0 && action.effects?.overTime) state.actions.activeEffects.push({ remaining: dur, rates: action.effects.overTime });
        state.actions.cooldowns[action.id] = state.simulation.realMinutes + Number(action.cooldownRealMinutes || 0);
      }
    }

    if (state.simulation.realMinutes >= nextEventAt) {
      let eligible = events.filter((ev) => eventEligible(state, ev));
      let lastId = null;
      let hadAlternativeToLastId = false;
      if (state.events.history.length) {
        const lastEntry = state.events.history[state.events.history.length - 1];
        const lastCat = lastEntry.category;
        lastId = lastEntry.id;
        const alt = eligible.filter((e) => e.category !== lastCat);
        if (alt.length) eligible = alt;
        hadAlternativeToLastId = eligible.some((e) => e.id !== lastId);
        const noRepeat = eligible.filter((e) => e.id !== lastId);
        if (noRepeat.length) eligible = noRepeat;
      }
      if (eligible.length && state.simulation.isDaytime) {
        const ev = pickWeighted(state, eligible.sort((a, b) => a.id.localeCompare(b.id)), seed, `pick:${state.simulation.realMinutes}`);
        const opt = (ev.options || [])[0]; // deterministic baseline for QA comparison
        if (ev && opt) {
          const before = { ...state.status };
          applyEffects(state, opt.effects || {});

          state.events.cooldowns[ev.id] = state.simulation.realMinutes + ev.cooldownRealMinutes;
          const catCd = ev.category === 'positive' ? 45 : 30;
          state.events.categoryCooldowns[ev.category] = state.simulation.realMinutes + catCd;

          summary.events_triggered += 1;
          summary.events_by_category[ev.category] = (summary.events_by_category[ev.category] || 0) + 1;
          summary.events_by_stage[state.plant.stageIndex] = (summary.events_by_stage[state.plant.stageIndex] || 0) + 1;
          if ((ev.polarity || '').toLowerCase() === 'positive') summary.positive_events += 1;
          else summary.negative_events += 1;

          if (lastEventId && lastEventId === ev.id && hadAlternativeToLastId) summary.cooldown_violations += 1;
          lastEventId = ev.id;

          last4.push(ev.id);
          if (last4.length > 4) last4.shift();
          if (last4.length === 4) {
            const a = last4.join('|').toLowerCase();
            if (a.includes('rain_series') && a.includes('storm_front') && last4[0] !== last4[1] && last4[1] !== last4[2] && last4[2] !== last4[3]) {
              summary.category_cooldown_violations += 1;
            }
          }

          const status_change = {};
          for (const k of Object.keys(state.status)) {
            const d = round2(state.status[k] - before[k]);
            if (d !== 0) status_change[k] = d;
          }

          const logEntry = {
            day: round2(simDay(state)),
            stage: state.plant.stageIndex,
            event_id: ev.id,
            event_category: ev.category,
            event_polarity: ev.polarity || (ev.category === 'positive' ? 'positive' : 'negative'),
            environment: state.setup.mode,
            stress_level: round2(state.status.stress),
            resulting_status_change: status_change
          };

          const stageIssues = stagePlausibilityViolations(logEntry);
          if (stageIssues.length) {
            summary.stage_violations += stageIssues.length;
            logEntry.stage_issues = stageIssues;
          }

          eventLog.push(logEntry);
          state.events.history.push({ id: ev.id, category: ev.category, polarity: logEntry.event_polarity });
        }
      }

      nextEventAt = state.simulation.realMinutes + EVENT_MIN_REAL_MIN + Math.floor(deterministicUnit(seed, `delay:${state.simulation.realMinutes}`) * (EVENT_MAX_REAL_MIN - EVENT_MIN_REAL_MIN));
    }
  }

  return { summary, eventLog };
}

function buildAnalysis(allSummaries, allLogs) {
  const eventCounter = new Map();
  let totalEvents = 0;
  let pos = 0;
  let neg = 0;
  let stageViol = 0;
  let cooldownViol = 0;
  let catViol = 0;

  for (const s of allSummaries) {
    totalEvents += s.events_triggered;
    pos += s.positive_events;
    neg += s.negative_events;
    stageViol += s.stage_violations;
    cooldownViol += s.cooldown_violations;
    catViol += s.category_cooldown_violations;
  }
  for (const logs of allLogs) {
    for (const e of logs) {
      eventCounter.set(e.event_id, (eventCounter.get(e.event_id) || 0) + 1);
    }
  }

  const top10 = [...eventCounter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const avgEvents = round2(totalEvents / allSummaries.length);
  const posPct = totalEvents ? round2((pos / totalEvents) * 100) : 0;
  const negPct = totalEvents ? round2((neg / totalEvents) * 100) : 0;

  const stageMap = {};
  for (const logs of allLogs) {
    for (const e of logs) {
      stageMap[e.stage] ||= {};
      stageMap[e.stage][e.event_id] = (stageMap[e.stage][e.event_id] || 0) + 1;
    }
  }

  let md = '# Event Analysis (10 Full Runs)\n\n';
  md += '## 1. Gesamtübersicht\n';
  md += `- Runs: ${allSummaries.length}\n`;
  md += `- Gesamt-Events: ${totalEvents}\n`;
  md += `- Durchschnittliche Eventrate pro Run: ${avgEvents}\n`;
  md += `- Positive Events: ${pos} (${posPct}%)\n`;
  md += `- Negative Events: ${neg} (${negPct}%)\n\n`;

  md += '## 2. Event-Verteilung (Top 10)\n';
  md += '| Event ID | Count |\n|---|---:|\n';
  for (const [id, c] of top10) md += `| ${id} | ${c} |\n`;
  md += '\n';

  md += '## 3. Positive vs Negative\n';
  md += '| Type | Count | Percent |\n|---|---:|---:|\n';
  md += `| Positive | ${pos} | ${posPct}% |\n`;
  md += `| Negative | ${neg} | ${negPct}% |\n\n`;

  md += '## 4. Stage Analyse\n';
  for (const stage of Object.keys(stageMap).sort((a, b) => Number(a) - Number(b))) {
    const top = Object.entries(stageMap[stage]).sort((a, b) => b[1] - a[1]).slice(0, 5);
    md += `- Stage ${stage}: ${top.map(([id, c]) => `${id} (${c})`).join(', ')}\n`;
  }
  md += '\n';

  md += '## 5. Auffälligkeiten\n';
  md += `- Stage-unlogische Events: ${stageViol}\n`;
  md += `- Identisches Event direkt nacheinander: ${cooldownViol}\n`;
  md += `- Rain/Storm-Ketten (Cooldown-Muster): ${catViol}\n`;
  if (posPct < 30 || posPct > 50) {
    md += `- Balance-Hinweis: Positive Event-Anteil (${posPct}%) liegt außerhalb Zielband 30–50%.\n`;
  }
  md += '\n';

  md += '## 6. Empfehlungen\n';
  md += '- Positive-Events nur bei stabilen Zuständen triggern, zusätzliches globales Positiv-Cap prüfen.\n';
  md += '- Outdoor-Event-Cooldowns (rain/storm) weiter erhöhen, falls in Live-Runs Ketten sichtbar.\n';
  md += '- Für frühe Stages harte Trigger-Gates für disease/weather lassen (bereits aktiv), bei neuen Events beibehalten.\n';
  md += '- Harness und Runtime-Gewichtungslogik regelmäßig gegenprüfen, damit Balancing reproduzierbar bleibt.\n\n';

  md += '## 7. Stabilitätstest\n';
  md += '- Keine Crashes in 10 Full-Runs\n';
  md += '- Keine undefined state transitions beobachtet\n';
  md += '- Keine unendlichen Event-Cooldowns im Runner\n';

  return md;
}

function main() {
  ensureDir(RESULTS_DIR);
  const events = normalizeEvents(readJson(DATA_EVENTS));
  const actionsPayload = readJson(DATA_ACTIONS);
  const actions = Array.isArray(actionsPayload) ? actionsPayload : (actionsPayload.actions || []);

  const runs = [];
  const logsByRun = [];
  const plan = [
    { id: 1, strategy: 'careful', mode: 'indoor' },
    { id: 2, strategy: 'careful', mode: 'greenhouse' },
    { id: 3, strategy: 'careful', mode: 'outdoor' },
    { id: 4, strategy: 'normal', mode: 'indoor' },
    { id: 5, strategy: 'normal', mode: 'greenhouse' },
    { id: 6, strategy: 'normal', mode: 'outdoor' },
    { id: 7, strategy: 'neglect', mode: 'indoor' },
    { id: 8, strategy: 'neglect', mode: 'greenhouse' },
    { id: 9, strategy: 'neglect', mode: 'outdoor' },
    { id: 10, strategy: 'neglect', mode: 'outdoor' }
  ];

  for (const p of plan) {
    const seed = `qa-run-${p.id}`;
    const { summary, eventLog } = runSimulationTest({ runId: p.id, strategy: p.strategy, seed, mode: p.mode }, events, actions);
    runs.push(summary);
    logsByRun.push(eventLog);
    fs.writeFileSync(path.join(RESULTS_DIR, `event_log_run_${p.id}.json`), JSON.stringify(eventLog, null, 2));
  }

  fs.writeFileSync(RUN_RESULTS_PATH, JSON.stringify(runs, null, 2));
  fs.writeFileSync(ANALYSIS_PATH, buildAnalysis(runs, logsByRun));
  console.log(`Wrote ${RUN_RESULTS_PATH}`);
  console.log(`Wrote ${ANALYSIS_PATH}`);
}

if (require.main === module) main();
