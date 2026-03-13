#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadSimContext() {
  const simSource = fs.readFileSync(path.join(__dirname, '..', 'sim.js'), 'utf8');

  const context = {
    console,
    Date,
    Math,
    setTimeout,
    clearTimeout,
    clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
    clampInt: (v, min, max) => Math.max(min, Math.min(max, Math.trunc(v))),
    round2: (v) => Math.round(v * 100) / 100,
    isDaytimeAtSimTime: (simTimeMs) => {
      const hour = new Date(simTimeMs).getHours();
      return hour >= 6 && hour < 22;
    },
    notifyPlantNeedsCare: () => {},
    runEventStateMachine: () => {},
    resetBoostDaily: () => {},
    updateVisibleOverlays: () => {},
    syncCanonicalStateShape: () => {},
    evaluateNotificationTriggers: () => {},
    renderSheets: () => {},
    renderHud: () => {},
    renderEventSheet: () => {},
    renderAnalysisPanel: () => {},
    renderDeathOverlay: () => {},
    schedulePersistState: () => {},
    addLog: () => {},
    getCanonicalMeta: () => ({ rescue: {} }),
    getStageTimeline: () => [{ phase: 'seedling' }, { phase: 'vegetative' }],
    stageAssetKeyForIndex: () => 'stage_01',
    applyStatusDrift: () => {},
    applyActiveActionEffects: () => {},
    advanceGrowthTick: () => {},
    syncDeathState: () => false,
    wasCriticalHealth: false,
    FREEZE_SIM_ON_DEATH: true,
    MAX_ELAPSED_PER_TICK_MS: 5000,
    MAX_OFFLINE_SIM_MS: 8 * 60 * 60 * 1000,
    SIM_DAY_START_HOUR: 6,
    SIM_NIGHT_START_HOUR: 22,
    REAL_RUN_DURATION_MS: 7 * 24 * 60 * 60 * 1000,
    TOTAL_LIFECYCLE_SIM_MS: 88 * 24 * 60 * 60 * 1000,
    SIM_DAY_MS: 24 * 60 * 60 * 1000,
    TOTAL_LIFECYCLE_SIM_DAYS: 88,
    STAGE_DEFS: [{ simDayStart: 0, phase: 'seedling' }, { simDayStart: 10, phase: 'vegetative' }],
    DEFAULT_STAGE_TIMELINE: [{ simDayStart: 0, phase: 'seedling', label: 'seedling' }, { simDayStart: 10, phase: 'vegetative', label: 'veg' }],
    PHASE_LABEL_DE: { seedling: 'Keimling' },
    STAGE_ASSET_FALLBACK: { stage_01: 'plant_growth_sprite.png#frame_001' },
    state: {
      simulation: {
        nowMs: 0,
        lastTickRealTimeMs: 0,
        startRealTimeMs: 0,
        simEpochMs: 0,
        simTimeMs: 0,
        growthImpulse: 0,
        isDaytime: false,
        tickCount: 0,
        fairnessGraceUntilRealMs: 0
      },
      ui: { openSheet: null, lastRenderRealMs: 0, deathOverlayOpen: false, deathOverlayAcknowledged: false },
      plant: { phase: 'seedling', isDead: false, stageIndex: 0, stageProgress: 0, stageKey: 'stage_01', lastValidStageKey: 'stage_01' },
      status: { health: 85, stress: 15, risk: 20, water: 70, nutrition: 65, growth: 0 },
      events: { machineState: 'idle', scheduler: { nextEventRealTimeMs: 0 } },
      boost: { dayStamp: '2026-01-01', boostUsedToday: 0 },
      debug: { enabled: false, showInternalTicks: false }
    }
  };

  context.isPlantDead = () => context.state.plant.phase === 'dead' || context.state.plant.isDead || context.state.status.health <= 0;

  vm.createContext(context);
  vm.runInContext(simSource, context, { filename: 'sim.js' });
  return context;
}

(function testNightLockPreventsImmediateDeath() {
  const ctx = loadSimContext();

  ctx.state.simulation.isDaytime = false;
  ctx.state.status.health = -5;

  ctx.applyFairnessSurvivalGuard(1_000);

  assert.strictEqual(ctx.state.plant.isDead, false, 'night lock should prevent death state');
  assert.ok(ctx.state.status.health >= 1, 'health should be clamped to survival floor');
})();

(function testNightToDaySetsReactionGrace() {
  const ctx = loadSimContext();

  const nightMs = new Date('2026-03-01T05:59:00').getTime();
  const dayMs = new Date('2026-03-01T06:01:00').getTime();

  ctx.state.simulation.startRealTimeMs = 0;
  ctx.state.simulation.simEpochMs = 0;
  ctx.state.simulation.simTimeMs = nightMs;
  ctx.state.simulation.lastTickRealTimeMs = 0;

  ctx.getPlantTimeFromElapsed = () => ({ simTimeMs: dayMs, simDay: 0, totalRunProgress: 0, elapsedPlantMs: 0 });
  ctx.applyStatusDrift = () => {};
  ctx.applyActiveActionEffects = () => {};
  ctx.advanceGrowthTick = () => {};

  ctx.applySimulationDelta(1_000, 1_000, 1_000);

  assert.ok(ctx.state.simulation.fairnessGraceUntilRealMs > 1_000, 'crossing into day should set grace window');
})();

console.log('night fairness tests passed');
