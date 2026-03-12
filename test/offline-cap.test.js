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
    isDaytimeAtSimTime: () => true,
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
    getStageTimeline: () => [{ phase: 'seedling' }],
    stageAssetKeyForIndex: () => 'stage_01',
    applyStatusDrift: () => {},
    applyActiveActionEffects: () => {},
    advanceGrowthTick: () => {},
    isPlantDead: () => false,
    syncDeathState: () => false,
    wasCriticalHealth: false,
    shouldProtectOfflineNightDeath: () => false,
    applyOfflineNightSurvivalClamp: () => {},
    FREEZE_SIM_ON_DEATH: true,
    MAX_ELAPSED_PER_TICK_MS: 5000,
    MAX_OFFLINE_SIM_MS: 8 * 60 * 60 * 1000,
    REAL_RUN_DURATION_MS: 7 * 24 * 60 * 60 * 1000,
    TOTAL_LIFECYCLE_SIM_MS: 88 * 24 * 60 * 60 * 1000,
    SIM_DAY_MS: 24 * 60 * 60 * 1000,
    TOTAL_LIFECYCLE_SIM_DAYS: 88,
    SIM_DAY_START_HOUR: 6,
    SIM_NIGHT_START_HOUR: 22,
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
        isDaytime: true,
        tickCount: 0
      },
      ui: { openSheet: null, lastRenderRealMs: 0 },
      plant: { phase: 'seedling', isDead: false, stageIndex: 0, stageProgress: 0, stageKey: 'stage_01', lastValidStageKey: 'stage_01' },
      status: { health: 85, stress: 15, risk: 20, water: 70, nutrition: 65, growth: 0 },
      events: { machineState: 'idle', scheduler: { nextEventRealTimeMs: 0 } },
      boost: { dayStamp: '2026-01-01', boostUsedToday: 0 },
      debug: { enabled: false, showInternalTicks: false }
    }
  };

  vm.createContext(context);
  vm.runInContext(simSource, context, { filename: 'sim.js' });
  return context;
}

(function testOfflineCapDrivesSimTimeAndDriftWithEffectiveElapsed() {
  const ctx = loadSimContext();
  const calls = { drift: [], eventNow: [] };

  ctx.applyStatusDrift = (elapsed) => calls.drift.push(elapsed);
  ctx.runEventStateMachine = (nowMs) => calls.eventNow.push(nowMs);
  ctx.applyActiveActionEffects = () => {};
  ctx.advanceGrowthTick = () => {};

  const offlineElapsedMs = 24 * 60 * 60 * 1000; // 24h away
  ctx.state.simulation.lastTickRealTimeMs = 0;
  ctx.state.simulation.startRealTimeMs = 0;
  ctx.state.simulation.simEpochMs = 1000;
  ctx.state.simulation.simTimeMs = 1000;

  ctx.syncSimulationFromElapsedTime(offlineElapsedMs);

  const capMs = ctx.MAX_OFFLINE_SIM_MS;
  const expectedProgress = capMs / ctx.REAL_RUN_DURATION_MS;
  const expectedSimMs = 1000 + (expectedProgress * ctx.TOTAL_LIFECYCLE_SIM_MS);

  assert.strictEqual(calls.drift.length, 1, 'status drift should be applied once');
  assert.strictEqual(calls.drift[0], capMs, 'status drift should use capped elapsed time');
  assert.ok(Math.abs(ctx.state.simulation.simTimeMs - expectedSimMs) < 0.001, 'sim time should advance using capped effective time');
  assert.strictEqual(calls.eventNow.length, 0, 'offline catch-up should suppress event state machine');
  assert.strictEqual(ctx.state.simulation.lastTickRealTimeMs, offlineElapsedMs, 'last tick should persist wall-clock now to prevent duplicate replay');
})();

(function testElapsedSimMsAlignedWithCappedProgression() {
  const ctx = loadSimContext();
  let elapsedToEffects = null;
  let elapsedToGrowth = null;

  ctx.applyStatusDrift = () => {};
  ctx.applyActiveActionEffects = (elapsedSimMs) => { elapsedToEffects = elapsedSimMs; };
  ctx.advanceGrowthTick = (elapsedSimMs) => { elapsedToGrowth = elapsedSimMs; };

  const offlineElapsedMs = 12 * 60 * 60 * 1000; // > cap
  ctx.state.simulation.lastTickRealTimeMs = 0;
  ctx.state.simulation.startRealTimeMs = 0;
  ctx.state.simulation.simEpochMs = 1000;
  ctx.state.simulation.simTimeMs = 1000;

  ctx.syncSimulationFromElapsedTime(offlineElapsedMs);

  const capMs = ctx.MAX_OFFLINE_SIM_MS;
  const expectedSimMs = (capMs / ctx.REAL_RUN_DURATION_MS) * ctx.TOTAL_LIFECYCLE_SIM_MS;

  assert.ok(Math.abs(elapsedToEffects - expectedSimMs) < 0.001, 'action over-time effects should use capped-derived sim delta');
  assert.ok(Math.abs(elapsedToGrowth - expectedSimMs) < 0.001, 'growth tick should use capped-derived sim delta');
})();

(function testOfflineCapPreventsDoubleProcessingOnQuickReopen() {
  const ctx = loadSimContext();

  ctx.applyStatusDrift = () => {};
  ctx.applyActiveActionEffects = () => {};
  ctx.advanceGrowthTick = () => {};

  const firstOpenMs = 24 * 60 * 60 * 1000;
  ctx.state.simulation.lastTickRealTimeMs = 0;
  ctx.state.simulation.startRealTimeMs = 0;
  ctx.state.simulation.simEpochMs = 1000;
  ctx.state.simulation.simTimeMs = 1000;

  ctx.syncSimulationFromElapsedTime(firstOpenMs);

  assert.strictEqual(ctx.state.simulation.lastTickRealTimeMs, firstOpenMs, 'first reopen should persist wall-clock now');

  const startAfterFirstCatchUp = ctx.state.simulation.startRealTimeMs;
  const simAfterFirstCatchUp = ctx.state.simulation.simTimeMs;

  ctx.syncSimulationFromElapsedTime(firstOpenMs + 2000);

  const simDeltaOnSecondOpen = ctx.state.simulation.simTimeMs - simAfterFirstCatchUp;
  assert.ok(simDeltaOnSecondOpen > 0, 'second reopen should still progress');
  assert.ok(simDeltaOnSecondOpen < 100_000_000, 'second reopen should not replay capped offline time again');
  assert.ok(startAfterFirstCatchUp > 0, 'run start should be shifted when offline time is discarded to avoid jump replay');
})();

(function testLiveTickBelowCapUsesRealElapsed() {
  const ctx = loadSimContext();
  const calls = { drift: [], eventNow: [] };

  ctx.applyStatusDrift = (elapsed) => calls.drift.push(elapsed);
  ctx.runEventStateMachine = (nowMs) => calls.eventNow.push(nowMs);
  ctx.applyActiveActionEffects = () => {};
  ctx.advanceGrowthTick = () => {};

  ctx.state.simulation.lastTickRealTimeMs = 1_000;
  ctx.state.simulation.startRealTimeMs = 0;
  ctx.state.simulation.simEpochMs = 1000;
  ctx.state.simulation.simTimeMs = 1000;

  const nowMs = 6_000;
  ctx.tick = vm.runInContext('tick', ctx);
  const originalDateNow = ctx.Date.now;
  ctx.Date.now = () => nowMs;
  ctx.tick();
  ctx.Date.now = originalDateNow;

  const expectedElapsed = 5_000;
  assert.strictEqual(calls.drift[0], expectedElapsed, 'live tick should still use live elapsed when under per-tick cap');
  assert.strictEqual(calls.eventNow[0], nowMs, 'event machine should use live effective now for normal ticks');
})();

console.log('offline-cap tests passed');
