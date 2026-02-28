const GROWTH_CONFIG = {
  phases: [
    { phase: 'seedling', stages: ['seedling_01.png', 'seedling_02.png'] },
    { phase: 'vegetative', stages: ['veg_01.png', 'veg_02.png', 'veg_03.png', 'veg_04.png'] },
    { phase: 'flowering', stages: ['flower_01.png', 'flower_02.png', 'flower_03.png'] },
    { phase: 'dead', stages: [] }
  ],
  ticksPerStage: {
    seedling: 2,
    vegetative: 3,
    flowering: 4
  }
  ticksPerStage: 20
};

const EVENT_DEFINITIONS = [
  {
    id: 'leaf-curl',
    title: 'Mild Leaf Curl',
    text: 'Lower fan leaves curl slightly. Choose a response.',
    options: [
      { label: 'Add water', effects: { water: 10, stress: -4, risk: -2, overlays: [] } },
      { label: 'Hold steady', effects: { stress: 1, risk: 1, overlays: [] } },
      { label: 'Emergency flush', effects: { water: -8, nutrition: -6, stress: -2, risk: 3, overlays: ['overlay_burn.png'] } }
    ]
  },
  {
    id: 'pest-signal',
    title: 'Pest Signal',
    text: 'You spot tiny moving dots on one branch.',
    options: [
      { label: 'Inspect and isolate', effects: { stress: 2, risk: -5, overlays: ['overlay_pest_mites.png'] } },
      { label: 'Do nothing', effects: { stress: 6, risk: 8, overlays: ['overlay_pest_thrips.png'] } },
      { label: 'Preventive spray', effects: { nutrition: -3, risk: -3, stress: 1, overlays: [] } }
    title: 'Mild Leaf Curl',
    text: 'Lower fan leaves curl slightly. Choose a response.',
    options: [
      { label: 'Add water', effects: { water: 10, stress: -4, risk: -2, overlay: '' } },
      { label: 'Hold steady', effects: { stress: 1, risk: 1, overlay: '' } },
      { label: 'Emergency flush', effects: { water: -8, nutrition: -6, stress: -2, risk: 3, overlay: 'overlay_burn.png' } }
    ]
  },
  {
    title: 'Pest Signal',
    text: 'You spot tiny moving dots on one branch.',
    options: [
      { label: 'Inspect and isolate', effects: { stress: 2, risk: -5, overlay: 'overlay_pest_mites.png' } },
      { label: 'Do nothing', effects: { stress: 6, risk: 8, overlay: 'overlay_pest_thrips.png' } },
      { label: 'Preventive spray', effects: { nutrition: -3, risk: -3, stress: 1, overlay: '' } }
    ]
  }
];

const state = {
  sim: {
    nowMs: Date.now(),
    startMs: Date.now(),
    tickCount: 0,
    mode: 'test',
    tickIntervalMs: 30000
  },

  growth: {
    phase: 'seedling',
  tickMs: 1000,
  simulation: {
    elapsedMs: 0,
    loopId: null,
    dateKey: new Date().toISOString().slice(0, 10)
  },
  metrics: {
    water: 82,
    nutrition: 78,
    health: 84,
    stress: 16,
    risk: 6,
    growthImpulse: 0
  },
  growth: {
    phase: '',
    stageIndex: 0,
    stageName: '',
    stageProgress: 0,
    ticksInStage: 0,
    lastValidStageName: ''
  },

  status: {
    health: 85,
    stress: 15,
    water: 70,
    nutrition: 65,
    growth: 10,
    risk: 20,
    growthImpulse: 0
  },

  boost: {
    boostUsedToday: 0,
    boostMaxPerDay: 6,
    dayStamp: new Date().toISOString().slice(0, 10)
  },

  event: {
    machineState: 'idle',
    activeEventId: null,
    activeEventTitle: '',
    activeEventText: '',
    activeOptions: [],
    lastEventAtMs: 0,
    cooldownUntilMs: 0,
    nextRollAtMs: 0,
    minIntervalMs: 30000,
    maxIntervalMs: 60000,
    resolvedAtMs: 0
  },

  ui: {
    openSheet: null,
    selectedBackground: 'bg_dark_01.jpg',
    visibleOverlayIds: []
  },

  log: [],
  loopId: null
  boost: {
    boostUsedToday: 0
  },
  events: {
    mode: 'test',
    minIntervalMs: 30000,
    maxIntervalMs: 60000,
    cooldownMs: 60000,
    status: 'idle',
    activeEvent: null,
    nextRollAtMs: 0,
    cooldownUntilMs: 0
  },
  log: [],
  ui: {
    openSheet: null,
    overlayName: ''
  }
};

const refs = {
  statusPill: document.getElementById('statusPill'),
  plantHero: document.getElementById('plantHero'),
  overlayLayer: document.getElementById('overlayLayer'),
  healthValueLabel: document.getElementById('healthValueLabel'),
  stressValueLabel: document.getElementById('stressValueLabel'),
  plantImage: document.getElementById('plantImage'),
  overlayLayer: document.getElementById('overlayLayer'),
  plantOverlay: document.getElementById('plantOverlay'),
  healthRing: document.getElementById('healthRing'),
  stressRing: document.getElementById('stressRing'),
  nextEventValue: document.getElementById('nextEventValue'),
  growthImpulseValue: document.getElementById('growthImpulseValue'),
  simTimeValue: document.getElementById('simTimeValue'),
  waterValue: document.getElementById('waterValue'),
  nutritionValue: document.getElementById('nutritionValue'),
  growthValue: document.getElementById('growthValue'),
  riskValue: document.getElementById('riskValue'),
  boostText: document.getElementById('boostText'),
  eventTitle: document.getElementById('eventTitle'),
  eventText: document.getElementById('eventText'),
  eventOptions: document.getElementById('eventOptions'),
  logList: document.getElementById('logList'),
  diagnosisDetails: document.getElementById('diagnosisDetails'),
  healthRingMount: document.getElementById('healthRingMount'),
  stressRingMount: document.getElementById('stressRingMount'),
  waterRingMount: document.getElementById('waterRingMount'),
  nutritionRingMount: document.getElementById('nutritionRingMount'),
  growthRingMount: document.getElementById('growthRingMount'),
  riskRingMount: document.getElementById('riskRingMount')
};

const ringNodes = {};


  diagnosisDetails: document.getElementById('diagnosisDetails')
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getPhaseConfig(phase) {
  return GROWTH_CONFIG.phases.find((item) => item.phase === phase);
}


function initGrowthState() {
  const first = GROWTH_CONFIG.phases[0];
  state.growth.phase = first.phase;
  state.growth.stageIndex = 0;
  state.growth.stageName = first.stages[0];
  state.growth.lastValidStageName = first.stages[0];
}

function scheduleNextEvent(nowMs) {
  const span = state.event.maxIntervalMs - state.event.minIntervalMs;
  const offset = Math.floor(Math.random() * (span + 1));
  state.event.nextRollAtMs = nowMs + state.event.minIntervalMs + offset;
}

function pushLog(text) {
  const time = formatSimTime(state.sim.nowMs);
  state.log.unshift(`[${time}] ${text}`);
  state.log = state.log.slice(0, 30);
}

function applyStatusDrift() {
  state.status.water = clamp(state.status.water - 2, 0, 100);
  state.status.nutrition = clamp(state.status.nutrition - 1.5, 0, 100);
  const stressDelta = (state.status.water < 35 ? 2 : -1) + (state.status.nutrition < 30 ? 1 : -0.5);
  state.status.stress = clamp(state.status.stress + stressDelta, 0, 100);
  state.status.risk = clamp(state.status.risk + (state.status.stress > 60 ? 2 : -1), 0, 100);
  state.status.health = clamp(100 - state.status.stress * 0.7 - state.status.risk * 0.3, 0, 100);
}

function advanceGrowthStage() {
  const current = getPhaseConfig(state.growth.phase);
  if (!current) return;

  if (state.growth.stageIndex < current.stages.length - 1) {
    state.growth.stageIndex += 1;
    state.growth.stageName = current.stages[state.growth.stageIndex];
    state.growth.lastValidStageName = state.growth.stageName;
  } else {
    const idx = GROWTH_CONFIG.phases.findIndex((p) => p.phase === state.growth.phase);
    const next = GROWTH_CONFIG.phases[idx + 1];

    if (!next) {
      state.growth.phase = 'dead';
    } else {
      state.growth.phase = next.phase;
      state.growth.stageIndex = 0;
      if (next.stages.length > 0) {
        state.growth.stageName = next.stages[0];
function initGrowthState() {
  const firstPhase = GROWTH_CONFIG.phases[0];
  state.growth.phase = firstPhase.phase;
  state.growth.stageIndex = 0;
  state.growth.stageName = firstPhase.stages[0];
  state.growth.lastValidStageName = firstPhase.stages[0];
}

function scheduleNextEvent(nowMs) {
  const span = state.events.maxIntervalMs - state.events.minIntervalMs;
  const offset = Math.floor(Math.random() * (span + 1));
  state.events.nextRollAtMs = nowMs + state.events.minIntervalMs + offset;
}

function applyDrift() {
  state.metrics.water = clamp(state.metrics.water - 0.32, 0, 100);
  state.metrics.nutrition = clamp(state.metrics.nutrition - 0.18, 0, 100);
  const underHydrated = state.metrics.water < 35 ? 0.6 : -0.2;
  const underFed = state.metrics.nutrition < 30 ? 0.4 : -0.1;
  state.metrics.stress = clamp(state.metrics.stress + underHydrated + underFed, 0, 100);
  state.metrics.health = clamp(100 - state.metrics.stress * 0.8 - state.metrics.risk * 0.35, 0, 100);
}

function updateGrowthFromTick() {
  if (state.growth.phase === 'dead') {
    state.metrics.growthImpulse = 0;
    return;
  }

  const vitality = (state.metrics.water + state.metrics.nutrition + state.metrics.health) / 300;
  const riskPenalty = state.metrics.risk / 180;
  const impulse = clamp(vitality - riskPenalty, 0, 1);
  state.metrics.growthImpulse = impulse;

  state.growth.ticksInStage += 1;
  state.growth.stageProgress = clamp(state.growth.ticksInStage / GROWTH_CONFIG.ticksPerStage, 0, 1);

  if (state.growth.stageProgress < 1) {
    return;
  }

  advanceGrowthStage();
}

function advanceGrowthStage() {
  const currentPhaseConfig = getPhaseConfig(state.growth.phase);
  if (!currentPhaseConfig) {
    return;
  }

  if (state.growth.stageIndex < currentPhaseConfig.stages.length - 1) {
    state.growth.stageIndex += 1;
    state.growth.stageName = currentPhaseConfig.stages[state.growth.stageIndex];
    state.growth.lastValidStageName = state.growth.stageName;
  } else {
    const currentPhaseIndex = GROWTH_CONFIG.phases.findIndex((item) => item.phase === state.growth.phase);
    const nextPhase = GROWTH_CONFIG.phases[currentPhaseIndex + 1];

    if (!nextPhase) {
      state.growth.phase = 'dead';
    } else {
      state.growth.phase = nextPhase.phase;
      state.growth.stageIndex = 0;
      if (nextPhase.stages.length > 0) {
        state.growth.stageName = nextPhase.stages[0];
        state.growth.lastValidStageName = state.growth.stageName;
      }
    }
  }

  if (state.growth.phase === 'dead') {
    state.growth.stageName = state.growth.lastValidStageName;
  }

  state.growth.stageProgress = 0;
  state.growth.ticksInStage = 0;
  pushLog(`Growth advanced to ${state.growth.phase} / ${state.growth.stageName}`);
}

function updateGrowthProgress() {
  if (state.growth.phase === 'dead') {
    state.status.growthImpulse = 0;
    return;
  }

  const vitality = (state.status.water + state.status.nutrition + state.status.health) / 300;
  const riskPenalty = state.status.risk / 180;
  state.status.growthImpulse = clamp(vitality - riskPenalty, 0, 1);

  state.growth.ticksInStage += 1;
  const ticksRequired = GROWTH_CONFIG.ticksPerStage[state.growth.phase];
  state.growth.stageProgress = clamp(state.growth.ticksInStage / ticksRequired, 0, 1);
  state.status.growth = Math.round(state.growth.stageProgress * 100);

  if (state.growth.stageProgress >= 1) {
    advanceGrowthStage();
  }
}

function startEvent(eventDef) {
  state.event.machineState = 'activeEvent';
  state.event.activeEventId = eventDef.id;
  state.event.activeEventTitle = eventDef.title;
  state.event.activeEventText = eventDef.text;
  state.event.activeOptions = eventDef.options;
  openSheet('eventSheet');
}

function runEventMachine(nowMs) {
  if (state.event.machineState === 'idle') {
    if (nowMs >= state.event.nextRollAtMs) {
      const pick = EVENT_DEFINITIONS[Math.floor(Math.random() * EVENT_DEFINITIONS.length)];
      startEvent(pick);
    }
    return;
  }

  if (state.event.machineState === 'resolved') {
    state.event.machineState = 'cooldown';
    state.event.cooldownUntilMs = nowMs + 60000;
    return;
  }

  if (state.event.machineState === 'cooldown' && nowMs >= state.event.cooldownUntilMs) {
    state.event.machineState = 'idle';
    state.event.activeEventId = null;
    state.event.activeEventTitle = '';
    state.event.activeEventText = '';
    state.event.activeOptions = [];
    scheduleNextEvent(nowMs);
  }
}

function resolveEvent(option) {
  state.status.water = clamp(state.status.water + (option.effects.water || 0), 0, 100);
  state.status.nutrition = clamp(state.status.nutrition + (option.effects.nutrition || 0), 0, 100);
  state.status.stress = clamp(state.status.stress + (option.effects.stress || 0), 0, 100);
  state.status.risk = clamp(state.status.risk + (option.effects.risk || 0), 0, 100);
  state.ui.visibleOverlayIds = option.effects.overlays || [];

  state.event.machineState = 'resolved';
  state.event.lastEventAtMs = state.sim.nowMs;
  state.event.resolvedAtMs = state.sim.nowMs;
  if (!state.events.activeEvent) {
    return;
  }

  const effects = option.effects;
  state.metrics.water = clamp(state.metrics.water + (effects.water || 0), 0, 100);
  state.metrics.nutrition = clamp(state.metrics.nutrition + (effects.nutrition || 0), 0, 100);
  state.metrics.stress = clamp(state.metrics.stress + (effects.stress || 0), 0, 100);
  state.metrics.risk = clamp(state.metrics.risk + (effects.risk || 0), 0, 100);
  state.ui.overlayName = effects.overlay || '';

  state.events.status = 'cooldown';
  state.events.cooldownUntilMs = state.simulation.elapsedMs + state.events.cooldownMs;
  closeSheet('eventSheet');
  pushLog(`Event resolved: ${option.label}`);
}

function maybeResetBoostCounter() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.boost.dayStamp !== today) {
    state.boost.dayStamp = today;
    state.boost.boostUsedToday = 0;
  }
}

function runCareAction(action) {
  const effectsMap = {
    water: { water: 12, stress: -4 },
function pushLog(text) {
  const time = formatSimTime(state.simulation.elapsedMs);
  state.log.unshift(`[${time}] ${text}`);
  state.log = state.log.slice(0, 30);
}

function runCareAction(action) {
  const actionEffects = {
    water: { water: 12, stress: -3 },
    feed: { nutrition: 10, stress: -2 },
    prune: { health: 3, stress: 2 },
    emergency: { risk: -10, stress: 5 }
  };
  const effects = effectsMap[action];
  if (!effects) return;

  state.status.water = clamp(state.status.water + (effects.water || 0), 0, 100);
  state.status.nutrition = clamp(state.status.nutrition + (effects.nutrition || 0), 0, 100);
  state.status.health = clamp(state.status.health + (effects.health || 0), 0, 100);
  state.status.stress = clamp(state.status.stress + (effects.stress || 0), 0, 100);
  state.status.risk = clamp(state.status.risk + (effects.risk || 0), 0, 100);
  pushLog(`Care action: ${action}`);
}

function runBoost() {
  maybeResetBoostCounter();
  if (state.boost.boostUsedToday >= state.boost.boostMaxPerDay) {
    pushLog('Boost cap reached');
    render();
  const effects = actionEffects[action];
  if (!effects) {
    return;
  }
  state.metrics.water = clamp(state.metrics.water + (effects.water || 0), 0, 100);
  state.metrics.nutrition = clamp(state.metrics.nutrition + (effects.nutrition || 0), 0, 100);
  state.metrics.health = clamp(state.metrics.health + (effects.health || 0), 0, 100);
  state.metrics.stress = clamp(state.metrics.stress + (effects.stress || 0), 0, 100);
  state.metrics.risk = clamp(state.metrics.risk + (effects.risk || 0), 0, 100);
  pushLog(`Care action: ${action}`);
}

function maybeResetBoostCounter() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.simulation.dateKey !== today) {
    state.simulation.dateKey = today;
    state.boost.boostUsedToday = 0;
  }
}

function runBoost() {
  maybeResetBoostCounter();
  if (state.boost.boostUsedToday >= 6) {
    pushLog('Boost cap reached');
    return;
  }

  state.boost.boostUsedToday += 1;

  const boostTicks = 2;
  for (let i = 0; i < boostTicks; i += 1) {
    runOneSimulationStep();
  }

  const boostMs = 12000;
  state.simulation.elapsedMs += boostMs;
  const boostTicks = Math.floor(boostMs / state.tickMs);
  for (let i = 0; i < boostTicks; i += 1) {
    applyDrift();
    updateGrowthFromTick();
    handleCooldown(state.simulation.elapsedMs);
    maybeTriggerEvent(state.simulation.elapsedMs);
  }
  pushLog('Boost used');
  render();
}

function runOneSimulationStep() {
  state.sim.nowMs += state.sim.tickIntervalMs;
  state.sim.tickCount += 1;
  applyStatusDrift();
  updateGrowthProgress();
  runEventMachine(state.sim.nowMs);
  maybeResetBoostCounter();
}

function formatSimTime(ms) {
  const totalSeconds = Math.floor((ms - state.sim.startMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
function formatSimTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function createRingSVG({ value = 0, size = 84, stroke = 15, variant = 'ring-mini' }) {
  const ns = 'http://www.w3.org/2000/svg';
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('class', 'ring-svg');
  svg.style.width = `${size}px`;
  svg.style.height = `${size}px`;

  const track = document.createElementNS(ns, 'circle');
  track.setAttribute('class', 'ring-track');
  track.setAttribute('cx', String(size / 2));
  track.setAttribute('cy', String(size / 2));
  track.setAttribute('r', String(radius));
  track.style.strokeWidth = `${stroke}`;

  const progress = document.createElementNS(ns, 'circle');
  progress.setAttribute('class', `ring-progress ${variant}`);
  progress.setAttribute('cx', String(size / 2));
  progress.setAttribute('cy', String(size / 2));
  progress.setAttribute('r', String(radius));
  progress.style.strokeWidth = `${stroke}`;
  progress.style.strokeDasharray = String(circumference);

  svg.append(track, progress);

  const setValue = (next) => {
    const valueClamped = clamp(next, 0, 100);
    const offset = circumference - (valueClamped / 100) * circumference;
    progress.style.strokeDashoffset = String(offset);
  };

  setValue(value);
  return { svg, setValue };
}

function setupRings() {
  ringNodes.health = createRingSVG({ value: state.status.health, size: 84, stroke: 15, variant: 'ring-health' });
  ringNodes.stress = createRingSVG({ value: state.status.stress, size: 84, stroke: 15, variant: 'ring-stress' });
  ringNodes.water = createRingSVG({ value: state.status.water, size: 42, stroke: 8, variant: 'ring-mini' });
  ringNodes.nutrition = createRingSVG({ value: state.status.nutrition, size: 42, stroke: 8, variant: 'ring-mini' });
  ringNodes.growth = createRingSVG({ value: state.status.growth, size: 42, stroke: 8, variant: 'ring-mini' });
  ringNodes.risk = createRingSVG({ value: state.status.risk, size: 42, stroke: 8, variant: 'ring-mini' });

  refs.healthRingMount.appendChild(ringNodes.health.svg);
  refs.stressRingMount.appendChild(ringNodes.stress.svg);
  refs.waterRingMount.appendChild(ringNodes.water.svg);
  refs.nutritionRingMount.appendChild(ringNodes.nutrition.svg);
  refs.growthRingMount.appendChild(ringNodes.growth.svg);
  refs.riskRingMount.appendChild(ringNodes.risk.svg);
}

function renderOverlays(currentState) {
  const activeOverlays = currentState.ui?.visibleOverlayIds || [];
  refs.overlayLayer.querySelectorAll('.plant-overlay').forEach((node) => {
    const name = node.getAttribute('data-overlay');
    node.classList.toggle('hidden', !activeOverlays.includes(name));
  });
}

function renderPlantAndOverlays() {
  refs.plantHero.src = `/assets/plant/${state.growth.stageName}`;
  renderOverlays(state);
function renderRing(node, value) {
  const total = 314;
  const offset = total - (clamp(value, 0, 100) / 100) * total;
  node.style.strokeDashoffset = String(offset);
}

function renderPlantAndOverlays() {
  refs.plantImage.src = `/assets/plant/${state.growth.stageName}`;

  refs.overlayLayer.innerHTML = '';
  state.ui.visibleOverlayIds.forEach((overlayName) => {
    const img = document.createElement('img');
    img.className = 'hero-overlay';
    img.src = `/assets/overlays/${overlayName}`;
    img.alt = 'Plant warning overlay';
    refs.overlayLayer.appendChild(img);
  });
}

function renderEventSheet() {
  if (state.event.machineState !== 'activeEvent') return;

  refs.eventTitle.textContent = state.event.activeEventTitle;
  refs.eventText.textContent = state.event.activeEventText;
  refs.eventOptions.innerHTML = '';

  state.event.activeOptions.forEach((option) => {
  const max = 314;
  const offset = max - (clamp(value, 0, 100) / 100) * max;
  node.style.strokeDashoffset = String(offset);
}

function renderPlant() {
  refs.plantImage.src = `/assets/plant/${state.growth.stageName}`;

  if (!state.ui.overlayName) {
    refs.plantOverlay.classList.add('hidden');
    return;
  }

  refs.plantOverlay.src = `/assets/overlays/${state.ui.overlayName}`;
  refs.plantOverlay.classList.remove('hidden');
}

function renderEventSheet() {
  if (state.events.status !== 'activeEvent' || !state.events.activeEvent) {
    return;
  }

  refs.eventTitle.textContent = state.events.activeEvent.title;
  refs.eventText.textContent = state.events.activeEvent.text;
  refs.eventOptions.innerHTML = '';

  state.events.activeEvent.options.forEach((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = option.label;
    button.addEventListener('click', () => {
      resolveEvent(option);
      render();
    });
    refs.eventOptions.appendChild(button);
  });
}

function renderLog() {
  refs.logList.innerHTML = '';
  state.log.forEach((entry) => {
    const item = document.createElement('li');
    item.textContent = entry;
    refs.logList.appendChild(item);
    const li = document.createElement('li');
    li.textContent = entry;
    refs.logList.appendChild(li);
  });
}

function render() {
  document.body.style.backgroundImage = `linear-gradient(180deg, rgba(7, 17, 30, 0.55), rgba(7, 17, 30, 0.95)), url('/assets/backgrounds/${state.ui.selectedBackground}')`;

  ringNodes.health.setValue(state.status.health);
  ringNodes.stress.setValue(state.status.stress);
  ringNodes.water.setValue(state.status.water);
  ringNodes.nutrition.setValue(state.status.nutrition);
  ringNodes.growth.setValue(state.status.growth);
  ringNodes.risk.setValue(state.status.risk);
  renderRing(refs.healthRing, state.status.health);
  renderRing(refs.stressRing, state.status.stress);
  renderPlantAndOverlays();

  const nextEventSec = Math.max(0, Math.ceil((state.event.nextRollAtMs - state.sim.nowMs) / 1000));
  refs.nextEventValue.textContent = `${nextEventSec}s`;
  refs.growthImpulseValue.textContent = `+${state.status.growthImpulse.toFixed(2)}`;
  refs.simTimeValue.textContent = formatSimTime(state.sim.nowMs);

  refs.waterValue.textContent = `${Math.round(state.status.water)}%`;
  refs.nutritionValue.textContent = `${Math.round(state.status.nutrition)}%`;
  refs.growthValue.textContent = `${Math.round(state.status.growth)}%`;
  refs.riskValue.textContent = `${Math.round(state.status.risk)}%`;
  refs.boostText.textContent = `Ad supported · ${state.boost.boostUsedToday}/6 today`;
  refs.healthValueLabel.textContent = `Health ${Math.round(state.status.health)}%`;
  refs.stressValueLabel.textContent = `Stress ${Math.round(state.status.stress)}%`;

  refs.statusPill.textContent = state.event.machineState === 'activeEvent' ? 'Attention' : 'Stable';
  refs.diagnosisDetails.textContent = `Phase ${state.growth.phase}, stage ${state.growth.stageName}, health ${Math.round(state.status.health)}%.`;

  refs.statusPill.textContent = state.event.machineState === 'activeEvent' ? 'Attention' : 'Stable';
  refs.diagnosisDetails.textContent = `Phase ${state.growth.phase}, stage ${state.growth.stageName}, health ${Math.round(state.status.health)}%.`;
  renderRing(refs.healthRing, state.metrics.health);
  renderRing(refs.stressRing, state.metrics.stress);
  renderPlant();

  const nextEventMs = Math.max(0, state.events.nextRollAtMs - state.simulation.elapsedMs);
  refs.nextEventValue.textContent = `${Math.ceil(nextEventMs / 1000)}s`;
  refs.growthImpulseValue.textContent = `+${state.metrics.growthImpulse.toFixed(2)}`;
  refs.simTimeValue.textContent = formatSimTime(state.simulation.elapsedMs);

  refs.waterValue.textContent = `${Math.round(state.metrics.water)}%`;
  refs.nutritionValue.textContent = `${Math.round(state.metrics.nutrition)}%`;
  refs.growthValue.textContent = `${Math.round(state.growth.stageProgress * 100)}%`;
  refs.riskValue.textContent = `${Math.round(state.metrics.risk)}%`;
  refs.boostText.textContent = `Ad supported · ${state.boost.boostUsedToday}/6 today`;

  refs.statusPill.textContent = state.events.status === 'activeEvent' ? 'Attention' : 'Stable';
  refs.diagnosisDetails.textContent = `Phase: ${state.growth.phase}, stage: ${state.growth.stageName}, stress ${Math.round(state.metrics.stress)}%, risk ${Math.round(state.metrics.risk)}%.`;

  renderEventSheet();
  renderLog();
}

function openSheet(id) {
  state.ui.openSheet = id;
  document.querySelectorAll('.sheet').forEach((sheet) => {
    const open = sheet.id === id;
    sheet.classList.toggle('hidden', !open);
    sheet.setAttribute('aria-hidden', String(!open));
  document.querySelectorAll('.sheet').forEach((node) => {
    const open = node.id === id;
    node.classList.toggle('hidden', !open);
    node.setAttribute('aria-hidden', String(!open));
  });
}

function closeSheet(id) {
  const sheet = document.getElementById(id);
  if (!sheet) return;
  sheet.classList.add('hidden');
  sheet.setAttribute('aria-hidden', 'true');
  if (sheet) {
    sheet.classList.add('hidden');
    sheet.setAttribute('aria-hidden', 'true');
  }
  if (state.ui.openSheet === id) {
    state.ui.openSheet = null;
  }
}

function closeAllSheets() {
  document.querySelectorAll('.sheet').forEach((sheet) => {
    sheet.classList.add('hidden');
    sheet.setAttribute('aria-hidden', 'true');
  });
  state.ui.openSheet = null;
}

function bindUI() {
  document.querySelectorAll('[data-open-sheet]').forEach((button) => {
    button.addEventListener('click', () => {
      openSheet(button.getAttribute('data-open-sheet'));
      const target = button.getAttribute('data-open-sheet');
      openSheet(target);
      render();
    });
  });

  document.querySelectorAll('[data-close-sheet]').forEach((button) => {
    button.addEventListener('click', closeAllSheets);
  });

  document.querySelectorAll('[data-care]').forEach((button) => {
    button.addEventListener('click', () => {
      runCareAction(button.getAttribute('data-care'));
      render();
    });
  });

  document.getElementById('boostButton').addEventListener('click', runBoost);

  document.getElementById('exportLogButton').addEventListener('click', () => {
    const data = JSON.stringify(state.log, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(data)
        .then(() => {
          pushLog('Log exported to clipboard');
          render();
        })
        .catch(() => {
          pushLog('Clipboard unavailable');
          render();
        });
      return;
    }
    pushLog('Clipboard unavailable');
    render();
    navigator.clipboard.writeText(data).then(() => {
      pushLog('Log exported to clipboard');
      render();
    });
  });

  document.getElementById('diagnosisCta').addEventListener('click', () => {
    pushLog('Advanced diagnosis requested');
    render();
  });
}

function tick() {
  runOneSimulationStep();
  state.simulation.elapsedMs += state.tickMs;
  maybeResetBoostCounter();
  applyDrift();
  updateGrowthFromTick();
  maybeTriggerEvent(state.simulation.elapsedMs);
  handleCooldown(state.simulation.elapsedMs);
  render();
}

function init() {
  initGrowthState();
  scheduleNextEvent(state.sim.nowMs);
  setupRings();
  scheduleNextEvent(0);
  bindUI();
  pushLog('Simulation started');
  render();

  if (state.loopId !== null) return;
  state.loopId = window.setInterval(tick, state.sim.tickIntervalMs);
  if (state.simulation.loopId !== null) {
    return;
  }
  state.simulation.loopId = window.setInterval(tick, state.tickMs);
}

init();
