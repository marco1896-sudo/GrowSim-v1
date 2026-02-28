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
};

const refs = {
  statusPill: document.getElementById('statusPill'),
  plantImage: document.getElementById('plantImage'),
  overlayLayer: document.getElementById('overlayLayer'),
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
    return;
  }

  state.boost.boostUsedToday += 1;

  const boostTicks = 2;
  for (let i = 0; i < boostTicks; i += 1) {
    runOneSimulationStep();
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
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

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
  });
}

function render() {
  document.body.style.backgroundImage = `linear-gradient(180deg, rgba(7, 17, 30, 0.55), rgba(7, 17, 30, 0.95)), url('/assets/backgrounds/${state.ui.selectedBackground}')`;

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

  refs.statusPill.textContent = state.event.machineState === 'activeEvent' ? 'Attention' : 'Stable';
  refs.diagnosisDetails.textContent = `Phase ${state.growth.phase}, stage ${state.growth.stageName}, health ${Math.round(state.status.health)}%.`;

  renderEventSheet();
  renderLog();
}

function openSheet(id) {
  state.ui.openSheet = id;
  document.querySelectorAll('.sheet').forEach((sheet) => {
    const open = sheet.id === id;
    sheet.classList.toggle('hidden', !open);
    sheet.setAttribute('aria-hidden', String(!open));
  });
}

function closeSheet(id) {
  const sheet = document.getElementById(id);
  if (!sheet) return;
  sheet.classList.add('hidden');
  sheet.setAttribute('aria-hidden', 'true');
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
  });

  document.getElementById('diagnosisCta').addEventListener('click', () => {
    pushLog('Advanced diagnosis requested');
    render();
  });
}

function tick() {
  runOneSimulationStep();
  render();
}

function init() {
  initGrowthState();
  scheduleNextEvent(state.sim.nowMs);
  bindUI();
  pushLog('Simulation started');
  render();

  if (state.loopId !== null) return;
  state.loopId = window.setInterval(tick, state.sim.tickIntervalMs);
}

init();
