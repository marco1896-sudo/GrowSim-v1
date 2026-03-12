'use strict';

function localStorageAdapter() {
  return {
    async get() {
      const raw = localStorage.getItem(LS_STATE_KEY);
      if (!raw) {
        return null;
      }
      try {
        return JSON.parse(raw);
      } catch (_error) {
        return null;
      }
    },
    async set(snapshot) {
      localStorage.setItem(LS_STATE_KEY, JSON.stringify(snapshot));
    }
  };
}


function normalizePendingChainsForStorage(store) {
  if (!store || typeof store !== 'object') {
    return {};
  }

  const entries = Object.entries(store)
    .filter(([chainId, record]) => chainId && record && typeof record === 'object')
    .map(([chainId, record]) => {
      const createdAtRealTimeMs = Number(record.createdAtRealTimeMs ?? record.atRealTimeMs ?? Date.now());
      const expiresAtRealTimeMs = record.expiresAtRealTimeMs == null ? null : Number(record.expiresAtRealTimeMs);
      return {
        chainId: String(chainId),
        targetEventId: record.targetEventId ? String(record.targetEventId) : String(chainId),
        sourceEventId: record.sourceEventId ? String(record.sourceEventId) : (record.eventId ? String(record.eventId) : null),
        sourceOptionId: record.sourceOptionId ? String(record.sourceOptionId) : (record.optionId ? String(record.optionId) : null),
        sourceFlagId: record.sourceFlagId ? String(record.sourceFlagId) : null,
        createdAtRealTimeMs: Number.isFinite(createdAtRealTimeMs) ? createdAtRealTimeMs : Date.now(),
        expiresAtRealTimeMs: Number.isFinite(expiresAtRealTimeMs) ? expiresAtRealTimeMs : null,
        meta: record.meta && typeof record.meta === 'object' ? { ...record.meta } : {}
      };
    })
    .filter((record) => record.expiresAtRealTimeMs == null || record.expiresAtRealTimeMs > Date.now())
    .sort((a, b) => Number(a.createdAtRealTimeMs || 0) - Number(b.createdAtRealTimeMs || 0));

  const trimmed = entries.slice(Math.max(0, entries.length - 12));
  return Object.fromEntries(trimmed.map((record) => [record.chainId, record]));
}

function getCanonicalSimulation(snapshot) {
  const s = snapshot || state;
  if (!s.simulation || typeof s.simulation !== 'object') {
    s.simulation = {};
  }

  const nowMs = Date.now();
  if (!Number.isFinite(s.simulation.nowMs)) s.simulation.nowMs = nowMs;
  if (!Number.isFinite(s.simulation.startRealTimeMs)) s.simulation.startRealTimeMs = nowMs;
  if (!Number.isFinite(s.simulation.lastTickRealTimeMs)) s.simulation.lastTickRealTimeMs = nowMs;
  if (!Number.isFinite(s.simulation.simTimeMs)) s.simulation.simTimeMs = alignToSimStartHour(nowMs, SIM_START_HOUR);
  if (!Number.isFinite(s.simulation.simEpochMs)) s.simulation.simEpochMs = s.simulation.startRealTimeMs;
  if (!Number.isFinite(s.simulation.simDay)) s.simulation.simDay = 0;
  if (!Number.isFinite(s.simulation.simHour)) s.simulation.simHour = SIM_START_HOUR;
  if (!Number.isFinite(s.simulation.simMinute)) s.simulation.simMinute = 0;
  if (!Number.isFinite(s.simulation.tickCount)) s.simulation.tickCount = 0;
  if (typeof s.simulation.mode !== 'string') s.simulation.mode = MODE;
  if (!Number.isFinite(s.simulation.tickIntervalMs)) s.simulation.tickIntervalMs = UI_TICK_INTERVAL_MS;
  if (!Number.isFinite(s.simulation.timeCompression)) s.simulation.timeCompression = SIM_TIME_COMPRESSION;
  if (typeof s.simulation.globalSeed !== 'string') s.simulation.globalSeed = SIM_GLOBAL_SEED;
  if (typeof s.simulation.plantId !== 'string') s.simulation.plantId = SIM_PLANT_ID;
  if (!s.simulation.dayWindow || typeof s.simulation.dayWindow !== 'object') s.simulation.dayWindow = { startHour: SIM_DAY_START_HOUR, endHour: SIM_NIGHT_START_HOUR };
  if (typeof s.simulation.isDaytime !== 'boolean') s.simulation.isDaytime = isDaytimeAtSimTime(s.simulation.simTimeMs);
  if (!Number.isFinite(s.simulation.growthImpulse)) s.simulation.growthImpulse = 0;
  if (!Number.isFinite(s.simulation.lastPushScheduleAtMs)) s.simulation.lastPushScheduleAtMs = 0;

  return s.simulation;
}

function getCanonicalPlant(snapshot) {
  const s = snapshot || state;
  if (!s.plant || typeof s.plant !== 'object') {
    s.plant = {};
  }

  if (typeof s.plant.phase !== 'string') s.plant.phase = 'seedling';
  if (typeof s.plant.isDead !== 'boolean') s.plant.isDead = false;
  if (!Number.isFinite(s.plant.stageIndex)) s.plant.stageIndex = 0;
  if (typeof s.plant.stageKey !== 'string') s.plant.stageKey = 'stage_01';
  if (!Number.isFinite(s.plant.stageProgress)) s.plant.stageProgress = 0;
  if (!Number.isFinite(s.plant.stageStartSimDay)) s.plant.stageStartSimDay = 0;
  if (typeof s.plant.lastValidStageKey !== 'string') s.plant.lastValidStageKey = 'stage_01';
  if (!Number.isFinite(s.plant.averageHealth)) s.plant.averageHealth = 85;
  if (!Number.isFinite(s.plant.averageStress)) s.plant.averageStress = 15;
  if (!Number.isFinite(s.plant.observedSimMs)) s.plant.observedSimMs = 0;
  if (!s.plant.lifecycle || typeof s.plant.lifecycle !== 'object') {
    s.plant.lifecycle = { totalSimDays: TOTAL_LIFECYCLE_SIM_DAYS, qualityTier: 'normal', qualityScore: 0, qualityLocked: false };
  }
  if (!s.plant.assets || typeof s.plant.assets !== 'object') {
    s.plant.assets = { basePath: 'assets/plant_growth/', resolvedStagePath: '' };
  }

  return s.plant;
}

function getCanonicalEvents(snapshot) {
  const s = snapshot || state;
  if (!s.events || typeof s.events !== 'object') {
    s.events = {};
  }

  if (typeof s.events.machineState !== 'string') s.events.machineState = 'idle';
  if (!s.events.scheduler || typeof s.events.scheduler !== 'object') {
    s.events.scheduler = {
      nextEventRealTimeMs: Date.now() + EVENT_ROLL_MIN_REAL_MS,
      lastEventRealTimeMs: 0,
      lastEventId: null,
      lastChoiceId: null,
      lastEventCategory: null,
      deferredUntilDaytime: false,
      windowRealMinutes: { min: 30, max: 90 },
      eventCooldowns: {},
      categoryCooldowns: {}
    };
  }
  if (!s.events.active || typeof s.events.active !== 'object') {
    s.events.active = null;
  }
  if (!Array.isArray(s.events.history)) s.events.history = [];
  if (typeof s.events.activeEventId !== 'string') s.events.activeEventId = null;
  if (typeof s.events.activeEventTitle !== 'string') s.events.activeEventTitle = '';
  if (typeof s.events.activeEventText !== 'string') s.events.activeEventText = '';
  if (typeof s.events.activeLearningNote !== 'string') s.events.activeLearningNote = '';
  if (!Array.isArray(s.events.activeOptions)) s.events.activeOptions = [];
  if (!Number.isFinite(s.events.activeSeverity)) s.events.activeSeverity = 1;
  if (!Number.isFinite(s.events.activeCooldownRealMinutes)) s.events.activeCooldownRealMinutes = 120;
  if (typeof s.events.activeCategory !== 'string') s.events.activeCategory = 'generic';
  if (!Array.isArray(s.events.activeTags)) s.events.activeTags = [];
  if (!Number.isFinite(s.events.lastEventAtMs)) s.events.lastEventAtMs = 0;
  if (!Number.isFinite(s.events.cooldownUntilMs)) s.events.cooldownUntilMs = 0;
  if (!Array.isArray(s.events.catalog)) s.events.catalog = [];
  if (!s.events.foundation || typeof s.events.foundation !== 'object') s.events.foundation = {};
  if (!s.events.foundation.flags || typeof s.events.foundation.flags !== 'object') s.events.foundation.flags = {};
  if (!s.events.foundation.memory || typeof s.events.foundation.memory !== 'object') s.events.foundation.memory = {};
  if (!Array.isArray(s.events.foundation.memory.events)) s.events.foundation.memory.events = [];
  if (!Array.isArray(s.events.foundation.memory.decisions)) s.events.foundation.memory.decisions = [];
  if (!s.events.foundation.memory.pendingChains || typeof s.events.foundation.memory.pendingChains !== 'object') s.events.foundation.memory.pendingChains = {};
  s.events.foundation.memory.pendingChains = normalizePendingChainsForStorage(s.events.foundation.memory.pendingChains);
  if (!Array.isArray(s.events.foundation.analysis)) s.events.foundation.analysis = [];

  return s.events;
}

function getCanonicalHistory(snapshot) {
  const s = snapshot || state;
  if (!s.history || typeof s.history !== 'object') {
    s.history = { actions: [], events: [], system: [], systemLog: [] };
  }
  if (!Array.isArray(s.history.actions)) s.history.actions = [];
  if (!Array.isArray(s.history.events)) s.history.events = [];
  if (!Array.isArray(s.history.system)) s.history.system = [];
  if (!Array.isArray(s.history.systemLog)) s.history.systemLog = [];
  return s.history;
}

function getCanonicalMeta(snapshot) {
  const s = snapshot || state;
  if (!s.meta || typeof s.meta !== 'object') {
    s.meta = {};
  }
  if (!s.meta.rescue || typeof s.meta.rescue !== 'object') {
    s.meta.rescue = {};
  }
  if (typeof s.meta.rescue.used !== 'boolean') s.meta.rescue.used = false;
  if (!Number.isFinite(Number(s.meta.rescue.usedAtRealMs))) s.meta.rescue.usedAtRealMs = null;
  if (s.meta.rescue.lastResult !== null && typeof s.meta.rescue.lastResult !== 'string') s.meta.rescue.lastResult = null;
  return s.meta;
}

function getCanonicalSettings(snapshot) {
  const s = snapshot || state;
  if (!s.settings || typeof s.settings !== 'object') {
    s.settings = {};
  }
  const notifications = getCanonicalNotificationsSettings(s);
  s.settings.notifications = notifications;
  return s.settings;
}

function getCanonicalNotificationsSettings(snapshot) {
  const s = snapshot || state;
  if (!s.settings || typeof s.settings !== 'object') {
    s.settings = {};
  }

  const legacyEnabled = Boolean(s.settings.pushNotificationsEnabled);
  if (!s.settings.notifications || typeof s.settings.notifications !== 'object') {
    s.settings.notifications = {};
  }

  const n = s.settings.notifications;
  n.enabled = typeof n.enabled === 'boolean' ? n.enabled : legacyEnabled;
  if (!n.types || typeof n.types !== 'object') {
    n.types = {};
  }
  n.types.events = typeof n.types.events === 'boolean' ? n.types.events : true;
  n.types.critical = typeof n.types.critical === 'boolean' ? n.types.critical : true;
  n.types.reminder = typeof n.types.reminder === 'boolean' ? n.types.reminder : true;

  if (!n.runtime || typeof n.runtime !== 'object') {
    n.runtime = {};
  }
  n.runtime.lastNotifiedEventId = (typeof n.runtime.lastNotifiedEventId === 'string' || n.runtime.lastNotifiedEventId === null)
    ? n.runtime.lastNotifiedEventId
    : null;
  n.runtime.lastCriticalAtRealMs = Number.isFinite(Number(n.runtime.lastCriticalAtRealMs)) ? Number(n.runtime.lastCriticalAtRealMs) : 0;
  n.runtime.lastReminderAtRealMs = Number.isFinite(Number(n.runtime.lastReminderAtRealMs)) ? Number(n.runtime.lastReminderAtRealMs) : 0;
  n.lastMessage = (typeof n.lastMessage === 'string' || n.lastMessage === null) ? n.lastMessage : null;

  return n;
}

async function restoreState() {
  if (!storageAdapter) {
    return;
  }

  const saved = await storageAdapter.get();
  if (!saved || typeof saved !== 'object') {
    return;
  }

  const sim = getCanonicalSimulation(state);
  const plant = getCanonicalPlant(state);
  const events = getCanonicalEvents(state);
  const history = getCanonicalHistory(state);
  const meta = getCanonicalMeta(state);
  const settings = getCanonicalSettings(state);

  if (saved.simulation && typeof saved.simulation === 'object') {
    state.simulation = {
      ...state.simulation,
      ...saved.simulation
    };
  }

  if (saved.plant && typeof saved.plant === 'object') {
    state.plant = {
      ...state.plant,
      ...saved.plant
    };
  }

  if (saved.events && typeof saved.events === 'object') {
    state.events = {
      ...state.events,
      ...saved.events,
      scheduler: {
        ...events.scheduler,
        ...((saved.events && saved.events.scheduler) || {})
      }
    };
  }

  if (saved.history && typeof saved.history === 'object') {
    state.history = {
      ...state.history,
      ...saved.history,
      actions: Array.isArray(saved.history.actions) ? saved.history.actions : history.actions,
      events: Array.isArray(saved.history.events) ? saved.history.events : history.events,
      system: Array.isArray(saved.history.system) ? saved.history.system : history.system,
      systemLog: Array.isArray(saved.history.systemLog) ? saved.history.systemLog : history.systemLog
    };
  }

  if (saved.status && typeof saved.status === 'object') {
    Object.assign(state.status, saved.status);
  }
  if (saved.boost && typeof saved.boost === 'object') {
    Object.assign(state.boost, saved.boost);
  }
  if (saved.actions && typeof saved.actions === 'object') {
    Object.assign(state.actions, saved.actions);
  }
  if (saved.ui && typeof saved.ui === 'object') {
    Object.assign(state.ui, saved.ui);
  }
  if (saved.setup && typeof saved.setup === 'object') {
    state.setup = { ...saved.setup };
  }
  if (saved.meta && typeof saved.meta === 'object') {
    state.meta = {
      ...meta,
      ...saved.meta,
      rescue: {
        ...meta.rescue,
        ...((saved.meta && saved.meta.rescue) || {})
      }
    };
  }
  if (saved.settings && typeof saved.settings === 'object') {
    state.settings = {
      ...settings,
      ...saved.settings
    };
    getCanonicalNotificationsSettings(state);
  }

  migrateLegacyStateIntoCanonical(saved, state);
}

function migrateLegacyStateIntoCanonical(saved, targetState) {
  const sim = getCanonicalSimulation(targetState);
  const plant = getCanonicalPlant(targetState);
  const events = getCanonicalEvents(targetState);
  const history = getCanonicalHistory(targetState);

  if (saved.sim && typeof saved.sim === 'object') {
    targetState.simulation = {
      ...sim,
      ...saved.sim,
      startRealTimeMs: Number(saved.sim.startRealTimeMs || saved.sim.simEpochMs || sim.startRealTimeMs),
      lastTickRealTimeMs: Number(saved.sim.lastTickAtMs || sim.lastTickRealTimeMs),
      simEpochMs: Number(saved.sim.simEpochMs || sim.simEpochMs),
      tickIntervalMs: Number(saved.sim.tickIntervalMs || sim.tickIntervalMs),
      growthImpulse: Number(saved.sim.growthImpulse || sim.growthImpulse),
      lastPushScheduleAtMs: Number(saved.sim.lastPushScheduleAtMs || sim.lastPushScheduleAtMs)
    };
  }

  if (saved.growth && typeof saved.growth === 'object') {
    targetState.plant = {
      ...plant,
      phase: String(saved.growth.phase || plant.phase),
      isDead: Boolean(saved.growth.isDead),
      stageIndex: clampInt(Number(saved.growth.stageIndex || 0), 0, Math.max(0, getStageTimeline().length - 1)),
      stageKey: String(saved.growth.stageName || plant.stageKey),
      stageProgress: clamp(Number(saved.growth.stageProgress || 0), 0, 1),
      lastValidStageKey: String(saved.growth.lastValidStageName || plant.lastValidStageKey),
      averageHealth: Number(saved.growth.averageHealth || plant.averageHealth),
      averageStress: Number(saved.growth.averageStress || plant.averageStress),
      observedSimMs: Number(saved.growth.observedSimMs || plant.observedSimMs),
      lifecycle: {
        ...plant.lifecycle,
        qualityTier: String(saved.growth.qualityTier || plant.lifecycle.qualityTier),
        qualityLocked: Boolean(saved.growth.qualityLocked)
      }
    };
  }

  if (saved.event && typeof saved.event === 'object') {
    const hasUsableEventsState = Boolean(saved.events && typeof saved.events === 'object' && saved.events.scheduler && typeof saved.events.scheduler === 'object');

    if (!hasUsableEventsState) {
      targetState.events = {
        ...events,
        machineState: String(saved.event.machineState || events.machineState),
        activeEventId: saved.event.activeEventId || null,
        activeEventTitle: String(saved.event.activeEventTitle || ''),
        activeEventText: String(saved.event.activeEventText || ''),
        activeLearningNote: String(saved.event.activeLearningNote || ''),
        activeOptions: Array.isArray(saved.event.activeOptions) ? saved.event.activeOptions : [],
        activeSeverity: Number(saved.event.activeSeverity || 1),
        activeCooldownRealMinutes: Number(saved.event.activeCooldownRealMinutes || 120),
        activeCategory: String(saved.event.activeCategory || 'generic'),
        activeTags: Array.isArray(saved.event.activeTags) ? saved.event.activeTags : [],
        lastEventAtMs: Number(saved.event.lastEventAtMs || 0),
        cooldownUntilMs: Number(saved.event.cooldownUntilMs || 0),
        catalog: Array.isArray(saved.event.catalog) ? saved.event.catalog : events.catalog,
        scheduler: {
          ...events.scheduler,
          nextEventRealTimeMs: Number(saved.event.nextEventAtMs || events.scheduler.nextEventRealTimeMs),
          lastEventRealTimeMs: Number(saved.event.lastEventAtMs || events.scheduler.lastEventRealTimeMs),
          lastEventId: typeof saved.event.activeEventId === 'string' ? saved.event.activeEventId : events.scheduler.lastEventId,
          lastChoiceId: typeof saved.event.lastChoiceId === 'string' ? saved.event.lastChoiceId : events.scheduler.lastChoiceId
        }
      };
    }
  }

  if (Array.isArray(saved.historyLog) && !history.system.length) {
    targetState.history.system = saved.historyLog.slice(-MAX_HISTORY_LOG).map((entry) => ({
      type: 'system',
      id: entry.type || 'legacy_log',
      atSimTimeMs: Number(entry.timestamp || targetState.simulation.simTimeMs || 0),
      details: entry
    }));
  }
}

async function persistState() {
  if (!storageAdapter) {
    return;
  }

  try {
    await storageAdapter.set(state);
  } catch (_error) {
    // Persistence failure is non-fatal for runtime behavior.
  }
}

function schedulePersistState(immediate = false) {
  if (immediate) {
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    persistState();
    return;
  }

  if (persistTimer !== null) {
    return;
  }

  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistState();
  }, PERSIST_THROTTLE_MS);
}

function migrateState() {
  try {
    if (!state || typeof state !== 'object') {
      throw new Error('state object missing');
    }

    if (!state.setup || typeof state.setup !== 'object') {
      state.setup = null;
    }

    if (!state.history || typeof state.history !== 'object') {
      state.history = { actions: [], events: [], system: [] };
    }

    if (!state.events || typeof state.events !== 'object') {
      state.events = {};
    }

    if (!state.plant || typeof state.plant !== 'object') {
      state.plant = {};
    }

    if (!state.simulation || typeof state.simulation !== 'object') {
      state.simulation = {};
    }

    if (!state.debug || typeof state.debug !== 'object') {
      state.debug = { enabled: false, showInternalTicks: false, forceDaytime: false };
    }
  } catch (error) {
    console.warn('State migration fallback to defaults', error);
    resetStateToDefaults();
  }
}

function resetStateToDefaults() {
  const fallbackNow = Date.now();
  const fallbackSimStart = alignToSimStartHour(fallbackNow, SIM_START_HOUR);
  const preservedEventCatalog = Array.isArray(state.events && state.events.catalog) ? state.events.catalog.slice() : [];
  const preservedActionCatalog = Array.isArray(state.actions && state.actions.catalog) ? state.actions.catalog.slice() : [];
  const normalizedActions = preservedActionCatalog.map(normalizeAction).filter(Boolean);

  state.schemaVersion = '1.0.0';
  state.seed = SIM_GLOBAL_SEED;
  state.plantId = SIM_PLANT_ID;
  state.setup = null;
  state.settings = {
    notifications: {
      enabled: false,
      types: {
        events: true,
        critical: true,
        reminder: true
      },
      runtime: {
        lastNotifiedEventId: null,
        lastCriticalAtRealMs: 0,
        lastReminderAtRealMs: 0
      },
      lastMessage: null
    },
    pushNotificationsEnabled: false
  };
  state.meta = {
    rescue: {
      used: false,
      usedAtRealMs: null,
      lastResult: null
    }
  };
  state.history = { actions: [], events: [], system: [], systemLog: [] };
  state.debug = { enabled: false, showInternalTicks: false, forceDaytime: false };

  state.simulation = {
    nowMs: fallbackNow,
    startRealTimeMs: fallbackNow,
    lastTickRealTimeMs: fallbackNow,
    simTimeMs: fallbackSimStart,
    simEpochMs: fallbackSimStart,
    simDay: 0,
    simHour: SIM_START_HOUR,
    simMinute: 0,
    tickCount: 0,
    mode: MODE,
    tickIntervalMs: UI_TICK_INTERVAL_MS,
    timeCompression: SIM_TIME_COMPRESSION,
    globalSeed: SIM_GLOBAL_SEED,
    plantId: SIM_PLANT_ID,
    dayWindow: { startHour: SIM_DAY_START_HOUR, endHour: SIM_NIGHT_START_HOUR },
    isDaytime: isDaytimeAtSimTime(fallbackSimStart),
    growthImpulse: 0,
    lastPushScheduleAtMs: 0
  };

  state.plant = {
    phase: 'seedling',
    isDead: false,
    stageIndex: 0,
    stageKey: 'stage_01',
    stageProgress: 0,
    stageStartSimDay: 0,
    lastValidStageKey: 'stage_01',
    averageHealth: 85,
    averageStress: 15,
    observedSimMs: 0,
    lifecycle: {
      totalSimDays: TOTAL_LIFECYCLE_SIM_DAYS,
      qualityTier: 'normal',
      qualityScore: 77.5,
      qualityLocked: false
    },
    assets: {
      basePath: 'assets/plant_growth/',
      resolvedStagePath: ''
    }
  };

  state.events = {
    machineState: 'idle',
    scheduler: {
      nextEventRealTimeMs: fallbackNow + EVENT_ROLL_MIN_REAL_MS,
      lastEventRealTimeMs: 0,
      lastEventId: null,
      lastChoiceId: null,
      lastEventCategory: null,
      deferredUntilDaytime: false,
      windowRealMinutes: { min: 30, max: 90 },
      eventCooldowns: {},
      categoryCooldowns: {}
    },
    active: null,
    history: [],
    activeEventId: null,
    activeEventTitle: '',
    activeEventText: '',
    activeLearningNote: '',
    activeOptions: [],
    activeSeverity: 1,
    activeCooldownRealMinutes: 120,
    activeCategory: 'generic',
    activeTags: [],
    lastEventAtMs: 0,
    cooldownUntilMs: 0,
    catalog: preservedEventCatalog
  };

  state.status = {
    health: 85,
    stress: 15,
    water: 70,
    nutrition: 65,
    growth: 0,
    risk: 20
  };

  state.boost = {
    boostUsedToday: 0,
    boostMaxPerDay: 6,
    dayStamp: dayStamp(fallbackNow)
  };

  state.actions = {
    catalog: normalizedActions,
    byId: Object.fromEntries(normalizedActions.map((action) => [action.id, action])),
    cooldowns: {},
    activeEffects: [],
    lastResult: { ok: true, reason: 'ok', actionId: null, atRealTimeMs: fallbackNow }
  };

  state.ui = {
    openSheet: null,
    menuOpen: false,
    menuDialogOpen: false,
    selectedBackground: 'bg_dark_01.jpg',
    visibleOverlayIds: [],
    deathOverlayOpen: false,
    deathOverlayAcknowledged: false,
    care: {
      selectedCategory: null,
      feedback: { kind: 'info', text: 'Bereit.' }
    },
    analysis: {
      activeTab: 'overview'
    }
  };

  state.lastEventId = null;
  state.lastChoiceId = null;
  state.historyLog = [];
}

function ensureStateIntegrity(nowMs) {
  if (typeof state.schemaVersion !== 'string') {
    state.schemaVersion = '1.0.0';
  }

  state.simulation.mode = MODE;
  state.simulation.tickIntervalMs = UI_TICK_INTERVAL_MS;
  state.simulation.timeCompression = SIM_TIME_COMPRESSION;
  state.simulation.globalSeed = SIM_GLOBAL_SEED;
  state.simulation.plantId = SIM_PLANT_ID;

  if (!Number.isFinite(state.simulation.nowMs)) {
    state.simulation.nowMs = nowMs;
  }
  if (!Number.isFinite(state.simulation.simTimeMs)) {
    state.simulation.simTimeMs = alignToSimStartHour(nowMs, SIM_START_HOUR);
  }
  if (!Number.isFinite(state.simulation.simEpochMs)) {
    state.simulation.simEpochMs = alignToSimStartHour(nowMs, SIM_START_HOUR);
  }
  if (!Number.isFinite(state.simulation.lastTickRealTimeMs)) {
    state.simulation.lastTickRealTimeMs = nowMs;
  }
  if (!Number.isFinite(state.simulation.tickCount)) {
    state.simulation.tickCount = 0;
  }
  if (!Number.isFinite(state.simulation.lastPushScheduleAtMs)) {
    state.simulation.lastPushScheduleAtMs = 0;
  }
  state.simulation.isDaytime = isDaytimeAtSimTime(state.simulation.simTimeMs);

  const validPhases = new Set(['seedling', 'vegetative', 'flowering', 'harvest']);
  if (!validPhases.has(state.plant.phase) && state.plant.phase !== 'dead') {
    state.plant.phase = 'seedling';
  }

  state.plant.lastValidStageKey = normalizeStageKey(state.plant.lastValidStageKey);
  const deadByHealth = Number(state.status.health) <= 0;
  const deadRequested = state.plant.phase === 'dead' || state.plant.isDead === true || deadByHealth;
  state.plant.isDead = deadRequested;

  if (!deadRequested) {
    state.plant.stageIndex = clampInt(state.plant.stageIndex, 0, Math.max(0, getStageTimeline().length - 1));
    state.plant.stageProgress = clamp(state.plant.stageProgress, 0, 1);
    state.plant.stageKey = normalizeStageKey(stageAssetKeyForIndex(state.plant.stageIndex));
    state.plant.lastValidStageKey = state.plant.stageKey;
    state.plant.phase = getStageTimeline()[state.plant.stageIndex]?.phase || 'seedling';
  } else {
    state.plant.phase = 'dead';
    state.plant.stageKey = normalizeStageKey(state.plant.lastValidStageKey || 'stage_01');
    state.plant.stageProgress = 1;
  }

  if (!Number.isFinite(state.plant.averageHealth)) {
    state.plant.averageHealth = state.status.health;
  }
  if (!Number.isFinite(state.plant.averageStress)) {
    state.plant.averageStress = state.status.stress;
  }
  if (!Number.isFinite(state.plant.observedSimMs)) {
    state.plant.observedSimMs = 0;
  }
  if (typeof state.plant.lifecycle.qualityTier !== 'string') {
    state.plant.lifecycle.qualityTier = 'normal';
  }
  if (typeof state.plant.lifecycle.qualityLocked !== 'boolean') {
    state.plant.lifecycle.qualityLocked = false;
  }

  clampStatus();
  state.status.growth = round2(computeGrowthPercent());

  state.boost.boostMaxPerDay = 6;
  if (!Number.isFinite(state.boost.boostUsedToday)) {
    state.boost.boostUsedToday = 0;
  }
  state.boost.boostUsedToday = clampInt(state.boost.boostUsedToday, 0, state.boost.boostMaxPerDay);
  if (typeof state.boost.dayStamp !== 'string' || !state.boost.dayStamp) {
    state.boost.dayStamp = dayStamp(nowMs);
  }

  const machineStates = new Set(['idle', 'activeEvent', 'resolved', 'cooldown']);
  if (!machineStates.has(state.events.machineState)) {
    state.events.machineState = 'idle';
  }
  if (!Number.isFinite(state.events.scheduler.nextEventRealTimeMs)) {
    state.events.scheduler.nextEventRealTimeMs = nowMs + deterministicEventDelayMs(nowMs);
  }
  if (!Number.isFinite(state.events.cooldownUntilMs)) {
    state.events.cooldownUntilMs = 0;
  }
  if (!Array.isArray(state.events.activeOptions)) {
    state.events.activeOptions = [];
  }
  if (!Array.isArray(state.events.activeTags)) {
    state.events.activeTags = [];
  }
  if (!Array.isArray(state.events.catalog)) {
    state.events.catalog = [];
  }

  if (!Array.isArray(state.actions.catalog)) {
    state.actions.catalog = [];
  }
  if (!state.actions.byId || typeof state.actions.byId !== 'object') {
    state.actions.byId = {};
  }
  if (!state.actions.cooldowns || typeof state.actions.cooldowns !== 'object') {
    state.actions.cooldowns = {};
  }
  if (!Array.isArray(state.actions.activeEffects)) {
    state.actions.activeEffects = [];
  }

  state.actions.catalog = state.actions.catalog.map(normalizeAction).filter(Boolean);
  state.actions.byId = Object.fromEntries(state.actions.catalog.map((action) => [action.id, action]));

  for (const [actionId, untilMs] of Object.entries(state.actions.cooldowns)) {
    if (!Number.isFinite(Number(untilMs)) || Number(untilMs) <= nowMs) {
      delete state.actions.cooldowns[actionId];
    }
  }

  state.actions.activeEffects = state.actions.activeEffects
    .filter((effect) => effect && Number.isFinite(Number(effect.remainingSimMs)) && Number(effect.remainingSimMs) > 0)
    .map((effect) => ({
      id: String(effect.id || `${effect.actionId || 'action'}:${nowMs}`),
      actionId: String(effect.actionId || ''),
      remainingSimMs: Math.max(0, Number(effect.remainingSimMs)),
      rates: effect.rates && typeof effect.rates === 'object' ? effect.rates : {}
    }));

  if (!state.actions.lastResult || typeof state.actions.lastResult !== 'object') {
    state.actions.lastResult = { ok: true, reason: 'ok', actionId: null, atRealTimeMs: nowMs };
  }

  const meta = getCanonicalMeta(state);
  const settings = getCanonicalSettings(state);
  meta.rescue.used = Boolean(meta.rescue.used);
  meta.rescue.usedAtRealMs = Number.isFinite(Number(meta.rescue.usedAtRealMs)) ? Number(meta.rescue.usedAtRealMs) : null;
  meta.rescue.lastResult = (typeof meta.rescue.lastResult === 'string' || meta.rescue.lastResult === null)
    ? meta.rescue.lastResult
    : null;
  getCanonicalNotificationsSettings(state);
  settings.pushNotificationsEnabled = Boolean(settings.pushNotificationsEnabled);

  if (!state.setup || typeof state.setup !== 'object') {
    state.setup = null;
  }

  if (!state.events || typeof state.events !== 'object') {
    state.events = { scheduler: {}, active: null, history: [] };
  }
  if (!state.events.scheduler || typeof state.events.scheduler !== 'object') {
    state.events.scheduler = {};
  }
  if (!state.events.scheduler.eventCooldowns || typeof state.events.scheduler.eventCooldowns !== 'object') {
    state.events.scheduler.eventCooldowns = {};
  }
  if (!state.events.scheduler.categoryCooldowns || typeof state.events.scheduler.categoryCooldowns !== 'object') {
    state.events.scheduler.categoryCooldowns = {};
  }
  for (const [eventId, untilMs] of Object.entries(state.events.scheduler.eventCooldowns)) {
    if (!Number.isFinite(Number(untilMs)) || Number(untilMs) <= nowMs) {
      delete state.events.scheduler.eventCooldowns[eventId];
    }
  }
  for (const [categoryId, untilMs] of Object.entries(state.events.scheduler.categoryCooldowns)) {
    if (!Number.isFinite(Number(untilMs)) || Number(untilMs) <= nowMs) {
      delete state.events.scheduler.categoryCooldowns[categoryId];
    }
  }
  if (!Array.isArray(state.events.history)) {
    state.events.history = [];
  }

  if (!state.history || typeof state.history !== 'object') {
    state.history = { actions: [], events: [], system: [] };
  }
  if (!Array.isArray(state.history.events)) {
    state.history.events = [];
  }

  const validSheets = new Set([null, 'care', 'event', 'dashboard', 'diagnosis']);
  if (!validSheets.has(state.ui.openSheet)) {
    state.ui.openSheet = null;
  }
  if (typeof state.ui.menuOpen !== 'boolean') {
    state.ui.menuOpen = false;
  }
  if (typeof state.ui.menuDialogOpen !== 'boolean') {
    state.ui.menuDialogOpen = false;
  }
  if (!Array.isArray(state.ui.visibleOverlayIds)) {
    state.ui.visibleOverlayIds = [];
  }
  if (!state.ui.care || typeof state.ui.care !== 'object') {
    state.ui.care = { selectedCategory: null, feedback: { kind: 'info', text: 'Bereit.' } };
  }
  if (typeof state.ui.care.selectedCategory !== 'string') {
    state.ui.care.selectedCategory = null;
  }
  if (!state.ui.care.feedback || typeof state.ui.care.feedback !== 'object') {
    state.ui.care.feedback = { kind: 'info', text: 'Bereit.' };
  }
  if (!state.ui.analysis || typeof state.ui.analysis !== 'object') {
    state.ui.analysis = { activeTab: 'overview' };
  }
  if (!['overview', 'diagnosis', 'timeline'].includes(state.ui.analysis.activeTab)) {
    state.ui.analysis.activeTab = 'overview';
  }
  if (typeof state.ui.deathOverlayOpen !== 'boolean') {
    state.ui.deathOverlayOpen = false;
  }
  if (typeof state.ui.deathOverlayAcknowledged !== 'boolean') {
    state.ui.deathOverlayAcknowledged = false;
  }

  if (typeof state.events.scheduler.lastEventId !== 'string') {
    state.events.scheduler.lastEventId = null;
  }
  if (typeof state.events.scheduler.lastChoiceId !== 'string') {
    state.events.scheduler.lastChoiceId = null;
  }
}

function syncCanonicalStateShape() {
  const sim = getCanonicalSimulation(state);
  const plant = getCanonicalPlant(state);
  const events = getCanonicalEvents(state);
  const history = getCanonicalHistory(state);
  const meta = getCanonicalMeta(state);
  const settings = getCanonicalSettings(state);

  state.seed = sim.globalSeed;
  state.plantId = sim.plantId;

  sim.simDay = Math.floor(simDayFloat());
  sim.simHour = simHour(sim.simTimeMs);
  sim.simMinute = new Date(sim.simTimeMs).getMinutes();
  sim.dayWindow = { startHour: SIM_DAY_START_HOUR, endHour: SIM_NIGHT_START_HOUR };
  sim.isDaytime = isDaytimeAtSimTime(sim.simTimeMs);

  plant.stageStartSimDay = getStageTimeline()[Math.max(0, plant.stageIndex)]?.simDayStart || 0;
  plant.lifecycle = {
    ...plant.lifecycle,
    totalSimDays: TOTAL_LIFECYCLE_SIM_DAYS,
    qualityScore: round2(plant.averageHealth - (plant.averageStress * 0.5))
  };
  plant.assets = {
    ...plant.assets,
    basePath: 'assets/plant_growth/',
    resolvedStagePath: plantAssetPath(plant.stageKey)
  };

  events.scheduler = {
    ...events.scheduler,
    nextEventRealTimeMs: Number(events.scheduler.nextEventRealTimeMs || sim.nowMs + EVENT_ROLL_MIN_REAL_MS),
    lastEventRealTimeMs: Number(events.scheduler.lastEventRealTimeMs || 0),
    deferredUntilDaytime: !sim.isDaytime,
    windowRealMinutes: { min: 30, max: 90 },
    eventCooldowns: events.scheduler.eventCooldowns || {},
    categoryCooldowns: events.scheduler.categoryCooldowns || {}
  };

  events.active = events.machineState === 'activeEvent'
    ? {
      id: events.activeEventId,
      title: events.activeEventTitle,
      description: events.activeEventText,
      category: events.activeCategory || 'generic',
      learningNote: events.activeLearningNote || ''
    }
    : null;

  history.actions = Array.isArray(history.actions) ? history.actions : [];
  history.events = Array.isArray(history.events) ? history.events : [];
  history.system = Array.isArray(history.system) ? history.system : [];
  history.systemLog = Array.isArray(history.systemLog) ? history.systemLog : [];
  meta.rescue.used = Boolean(meta.rescue.used);
  meta.rescue.usedAtRealMs = Number.isFinite(Number(meta.rescue.usedAtRealMs)) ? Number(meta.rescue.usedAtRealMs) : null;
  meta.rescue.lastResult = (typeof meta.rescue.lastResult === 'string' || meta.rescue.lastResult === null)
    ? meta.rescue.lastResult
    : null;
  getCanonicalNotificationsSettings(state);
  settings.pushNotificationsEnabled = Boolean(settings.pushNotificationsEnabled);

  if (Object.prototype.hasOwnProperty.call(state, 'event')) {
    delete state.event;
  }

  syncLegacyMirrorsFromCanonical(state);
}

function syncLegacyMirrorsFromCanonical(snapshot) {
  const s = snapshot;
  const sim = getCanonicalSimulation(s);
  const plant = getCanonicalPlant(s);
  const events = getCanonicalEvents(s);
  const history = getCanonicalHistory(s);

  s.sim = {
    nowMs: sim.nowMs,
    simTimeMs: sim.simTimeMs,
    simEpochMs: sim.simEpochMs,
    tickCount: sim.tickCount,
    mode: sim.mode,
    tickIntervalMs: sim.tickIntervalMs,
    timeCompression: sim.timeCompression,
    globalSeed: sim.globalSeed,
    plantId: sim.plantId,
    isDaytime: sim.isDaytime,
    lastTickAtMs: sim.lastTickRealTimeMs,
    growthImpulse: sim.growthImpulse,
    lastPushScheduleAtMs: sim.lastPushScheduleAtMs
  };

  s.growth = {
    phase: plant.phase,
    isDead: plant.isDead,
    stageIndex: Math.max(0, plant.stageIndex - 1),
    stageName: plant.stageKey,
    stageProgress: plant.stageProgress,
    lastValidStageName: plant.lastValidStageKey,
    averageHealth: plant.averageHealth,
    averageStress: plant.averageStress,
    observedSimMs: plant.observedSimMs,
    qualityTier: plant.lifecycle.qualityTier,
    qualityLocked: Boolean(plant.lifecycle.qualityLocked)
  };

  s.lastEventId = events.scheduler.lastEventId || null;
  s.lastChoiceId = events.scheduler.lastChoiceId || null;
  s.historyLog = Array.isArray(history.systemLog) ? history.systemLog : [];
}

window.GrowSimStorage = Object.freeze({
  localStorageAdapter,
  getCanonicalSimulation,
  getCanonicalPlant,
  getCanonicalEvents,
  getCanonicalHistory,
  getCanonicalMeta,
  getCanonicalSettings,
  getCanonicalNotificationsSettings,
  restoreState,
  persistState,
  schedulePersistState,
  migrateState,
  resetStateToDefaults,
  ensureStateIntegrity,
  syncCanonicalStateShape,
  syncLegacyMirrorsFromCanonical
});
