'use strict';

const fs = require('fs');
const path = require('path');

const resolverApi = require('../src/events/eventResolver.js');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function verifyPipelineOrderFromSource() {
  const resolverPath = path.join(__dirname, '..', 'src', 'events', 'eventResolver.js');
  const source = fs.readFileSync(resolverPath, 'utf8');

  const phaseIdx = source.indexOf('applyPhaseGuard(');
  const repeatIdx = source.indexOf('applyRepeatGuard(');
  const frustrationIdx = source.indexOf('applyFrustrationGuard(');

  assert(phaseIdx >= 0, 'phase guard step missing in resolver source');
  assert(repeatIdx >= 0, 'repeat guard step missing in resolver source');
  assert(frustrationIdx >= 0, 'frustration guard step missing in resolver source');
  assert(phaseIdx < repeatIdx && repeatIdx < frustrationIdx, 'guard execution order is not phase -> repeat -> frustration');
}

function createMemory({ recentEvents = [], pendingChains = {} } = {}) {
  return {
    getLastEvents: (count) => recentEvents.slice(Math.max(0, recentEvents.length - (Number(count) || 0))),
    getPendingChains: () => ({ ...pendingChains }),
    getLastDecision: () => null
  };
}

function verifyGuardsExecuteDuringSelection() {
  const catalog = [
    { id: 'drooping_leaves_warning', tone: 'negative', allowedPhases: ['vegetative'] },
    { id: 'root_stress_followup', tone: 'negative', allowedPhases: ['vegetative'], isFollowUp: true },
    { id: 'stable_growth_reward', tone: 'positive', allowedPhases: ['harvest', 'vegetative'] }
  ];

  const phaseResult = resolverApi.applyGuardPipeline([
    { eventId: 'drooping_leaves_warning', reason: 'condition:high_water', priority: 80, isFollowUp: false },
    { eventId: 'stable_growth_reward', reason: 'condition:stable_growth', priority: 40, isFollowUp: false }
  ], {
    phase: 'harvest',
    memory: createMemory(),
    catalog,
    repeatWindow: 3
  });
  assert(phaseResult.length === 1 && phaseResult[0].eventId === 'stable_growth_reward', 'phase guard not applied during resolver selection');

  const repeatResult = resolverApi.applyGuardPipeline([
    { eventId: 'drooping_leaves_warning', reason: 'condition:high_water', priority: 80, isFollowUp: false },
    { eventId: 'stable_growth_reward', reason: 'condition:stable_growth', priority: 40, isFollowUp: false }
  ], {
    phase: 'vegetative',
    memory: createMemory({ recentEvents: [{ eventId: 'drooping_leaves_warning' }] }),
    catalog,
    repeatWindow: 3
  });
  assert(repeatResult.length === 1 && repeatResult[0].eventId === 'stable_growth_reward', 'repeat guard not applied during resolver selection');

  const frustrationResult = resolverApi.applyGuardPipeline([
    { eventId: 'drooping_leaves_warning', reason: 'condition:high_water', priority: 80, isFollowUp: false },
    { eventId: 'stable_growth_reward', reason: 'condition:stable_growth', priority: 40, isFollowUp: false }
  ], {
    phase: 'vegetative',
    memory: createMemory({ recentEvents: [{ eventId: 'drooping_leaves_warning' }, { eventId: 'root_stress_followup' }] }),
    catalog,
    repeatWindow: 3
  });
  assert(frustrationResult.length === 1 && frustrationResult[0].eventId === 'stable_growth_reward', 'frustration guard not applied during resolver selection');

  const pendingBypassResult = resolverApi.resolveNextEvent({
    state: { phase: 'harvest', water: 90, nutrients: 20, vitality: 30, stress: 80, pestPressure: 70 },
    flags: [],
    memory: createMemory({
      recentEvents: [{ eventId: 'drooping_leaves_warning' }, { eventId: 'root_stress_followup' }],
      pendingChains: {
        root_stress_followup: {
          chainId: 'root_stress_followup',
          targetEventId: 'root_stress_followup',
          createdAtRealTimeMs: Date.now()
        }
      }
    }),
    catalog
  });
  assert(pendingBypassResult.eventId === 'root_stress_followup', 'pending-chain bypass not preserved');

  const fallbackResult = resolverApi.resolveNextEvent({
    state: { phase: 'harvest', water: 90, nutrients: 20, vitality: 30, stress: 80, pestPressure: 70 },
    flags: [],
    memory: createMemory(),
    catalog
  });
  assert(fallbackResult.eventId === 'drooping_leaves_warning', 'fallback-to-original candidates not preserved');
}

function verifyRuntimeSelectionIntegration() {
  const eventsSource = fs.readFileSync(path.join(__dirname, '..', 'events.js'), 'utf8');
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  assert(eventsSource.includes('resolveFoundationCandidateEvent()'), 'events.js does not call resolver integration helper');
  assert(eventsSource.includes('api.resolver.resolveNextEvent'), 'events.js does not execute resolver selection');
  assert(appSource.includes('resolveFoundationCandidateEvent()'), 'app.js does not call resolver integration helper');
}

(function main() {
  verifyPipelineOrderFromSource();
  verifyGuardsExecuteDuringSelection();
  verifyRuntimeSelectionIntegration();
  console.log('resolver guard pipeline verification passed');
})();
