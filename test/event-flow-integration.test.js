#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const plantStateApi = require('../src/simulation/plantState.js');
const flagsApi = require('../src/events/eventFlags.js');
const memoryApi = require('../src/events/eventMemory.js');
const analysisApi = require('../src/events/eventAnalysis.js');
const resolverApi = require('../src/events/eventResolver.js');

function loadEventsContext() {
  const eventsSource = fs.readFileSync(path.join(__dirname, '..', 'events.js'), 'utf8');

  const context = {
    console,
    Date,
    Math,
    setTimeout,
    clearTimeout,
    clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
    round2: (v) => Math.round(Number(v || 0) * 100) / 100,
    deterministicUnitFloat: () => 0,
    deterministicRoll: () => 0,
    simDayFloat: () => 1,
    simHour: () => 12,
    eventThreshold: () => 1,
    EVENT_COOLDOWN_MS: 30 * 60 * 1000,
    EVENT_ROLL_MIN_REAL_MS: 1 * 60 * 1000,
    EVENT_ROLL_MAX_REAL_MS: 2 * 60 * 1000,
    nextDaytimeRealMs: (nowMs) => nowMs,
    schedulePushIfAllowed: () => {},
    schedulePersistState: () => {},
    renderAll: () => {},
    notifyPlantNeedsCare: () => {},
    addLog: () => {},
    isPlantDead: () => false,
    clampStatus: () => {},
    syncCanonicalStateShape: () => {},
    window: {
      GrowSimPlantState: plantStateApi,
      GrowSimEventFlags: flagsApi,
      GrowSimEventMemory: memoryApi,
      GrowSimEventAnalysis: analysisApi,
      GrowSimEventResolver: resolverApi
    },
    state: {
      status: { water: 90, nutrition: 60, health: 80, stress: 30, risk: 30, growth: 0 },
      plant: { phase: 'vegetative', stageIndex: 1, stageKey: 'veg', lifecycle: { qualityScore: 55 } },
      simulation: { isDaytime: true, nowMs: 10_000, simTimeMs: 5_000, tickCount: 42 },
      setup: { mode: 'soil' },
      history: { events: [] },
      ui: { openSheet: null },
      events: {
        machineState: 'activeEvent',
        activeEventId: 'drooping_leaves_warning',
        activeCategory: 'water',
        activeLearningNote: 'Drainage early.',
        activeOptions: [
          { id: 'ignore_signals', label: 'Ignore signs', effects: { stress: 5, risk: 6 }, followUps: ['set_flag:root_stress_pending'] }
        ],
        scheduler: {
          nextEventRealTimeMs: 0,
          eventCooldowns: {},
          categoryCooldowns: {},
          lastEventId: null,
          lastEventRealTimeMs: 0
        },
        catalog: [
          {
            id: 'drooping_leaves_warning',
            title: 'Drooping leaves warning',
            description: 'Water pressure event',
            category: 'water',
            tone: 'warning',
            allowedPhases: ['vegetative'],
            options: [{ id: 'ignore_signals', label: 'Ignore signs', effects: { stress: 5, risk: 6 }, followUps: ['set_flag:root_stress_pending'] }]
          },
          {
            id: 'root_stress_followup',
            title: 'Root stress follow-up',
            description: 'Root stress escalated',
            category: 'disease',
            tone: 'negative',
            isFollowUp: true,
            allowedPhases: ['vegetative'],
            options: [{ id: 'recover_root_zone', label: 'Recover root zone', effects: { stress: -6, risk: -5 }, followUps: ['clear_flag:root_stress_pending'] }]
          }
        ],
        foundation: {
          flags: {},
          memory: { events: [], decisions: [], pendingChains: {} },
          analysis: []
        },
        history: []
      }
    }
  };

  vm.createContext(context);
  vm.runInContext(eventsSource, context, { filename: 'events.js' });
  return context;
}

(function testEventFlowIntegration() {
  const ctx = loadEventsContext();
  const eventsApi = ctx.window.GrowSimEvents;

  eventsApi.onEventOptionClick('ignore_signals');

  const pendingAfterDecision = memoryApi.getPendingChain(ctx.state.events, 'root_stress_followup');
  assert(pendingAfterDecision, 'decision should create root_stress_followup pending chain');
  assert.strictEqual(flagsApi.hasFlag(ctx.state.events, 'root_stress_pending'), true, 'decision should set root_stress_pending flag');

  const lastDecision = memoryApi.getLastDecision(ctx.state.events);
  assert(lastDecision, 'decision should be stored in foundation memory');
  assert.strictEqual(lastDecision.eventId, 'drooping_leaves_warning');
  assert.strictEqual(lastDecision.optionId, 'ignore_signals');
  assert(lastDecision.analysisId, 'decision should be linked to generated analysis');

  const latestAnalysis = analysisApi.getLatestAnalysis(ctx.state.events);
  assert(latestAnalysis, 'analysis should be generated and stored');
  assert.strictEqual(latestAnalysis.eventId, 'drooping_leaves_warning');
  assert.strictEqual(latestAnalysis.optionId, 'ignore_signals');
  assert.strictEqual(latestAnalysis.relatedChainId, 'root_stress_followup', 'analysis should keep pending chain causal context');

  ctx.state.events.machineState = 'idle';
  ctx.state.simulation.nowMs += 1;
  ctx.state.events.scheduler.nextEventRealTimeMs = 0;

  const activated = eventsApi.activateEvent(ctx.state.simulation.nowMs);
  assert.strictEqual(activated, true, 'scheduler-like activation should select a follow-up event');
  assert.strictEqual(ctx.state.events.activeEventId, 'root_stress_followup', 'follow-up event should be activated');

  const pendingAfterActivation = memoryApi.getPendingChain(ctx.state.events, 'root_stress_followup');
  assert.strictEqual(pendingAfterActivation, null, 'pending chain should be consumed on follow-up activation');

  const lastEvent = memoryApi.getLastEvents(ctx.state.events, 1)[0];
  assert(lastEvent, 'activated follow-up should be recorded in event memory');
  assert.strictEqual(lastEvent.eventId, 'root_stress_followup');
  assert.strictEqual(lastEvent.meta.consumedChainId, 'root_stress_followup', 'event memory should keep consumed chain id');
  assert.strictEqual(lastEvent.meta.sourceEventId, 'drooping_leaves_warning', 'event memory should keep source event causal link');

  const resolverCandidateAfterConsume = eventsApi.resolveFoundationCandidateEvent();
  assert.notStrictEqual(
    resolverCandidateAfterConsume && resolverCandidateAfterConsume.reason,
    'pending_chain:root_stress_followup',
    'resolver should not keep stale pending-chain pressure after consume'
  );

  console.log('event-flow integration test passed');
})();
