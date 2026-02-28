const GROWTH_CONFIG = {
  phases: [
    { phase: 'seedling', stages: ['seedling_01.png', 'seedling_02.png'] },
    { phase: 'vegetative', stages: ['veg_01.png', 'veg_02.png', 'veg_03.png', 'veg_04.png'] },
    { phase: 'flowering', stages: ['flower_01.png', 'flower_02.png', 'flower_03.png'] },
    { phase: 'dead', stages: [] }
  ],
  ticksPerStage: 20
};

const EVENT_DEFINITIONS = [
  {
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
  plantImage: document.getElementById('plantImage'),
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
  diagnosisDetails: document.getElementById('diagnosisDetails')
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getPhaseConfig(phase) {
  return GROWTH_CONFIG.phases.find((item) => item.phase === phase);
}

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

function maybeTriggerEvent(nowMs) {
  if (state.events.status !== 'idle') {
    return;
  }

  if (nowMs < state.events.nextRollAtMs) {
    return;
  }

  const nextEvent = EVENT_DEFINITIONS[Math.floor(Math.random() * EVENT_DEFINITIONS.length)];
  state.events.status = 'activeEvent';
  state.events.activeEvent = nextEvent;
  openSheet('eventSheet');
}

function handleCooldown(nowMs) {
  if (state.events.status !== 'cooldown') {
    return;
  }

  if (nowMs >= state.events.cooldownUntilMs) {
    state.events.status = 'idle';
    state.events.activeEvent = null;
    scheduleNextEvent(nowMs);
  }
}

function resolveEvent(option) {
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

function formatSimTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function renderRing(node, value) {
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
    const li = document.createElement('li');
    li.textContent = entry;
    refs.logList.appendChild(li);
  });
}

function render() {
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
  document.querySelectorAll('.sheet').forEach((node) => {
    const open = node.id === id;
    node.classList.toggle('hidden', !open);
    node.setAttribute('aria-hidden', String(!open));
  });
}

function closeSheet(id) {
  const sheet = document.getElementById(id);
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
  scheduleNextEvent(0);
  bindUI();
  pushLog('Simulation started');
  render();

  if (state.simulation.loopId !== null) {
    return;
  }
  state.simulation.loopId = window.setInterval(tick, state.tickMs);
}

init();
