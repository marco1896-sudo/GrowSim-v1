'use strict';

(function initEventMemory(globalScope) {
  const MAX_PENDING_CHAINS = 12;

  function normalizePendingChain(chainId, record) {
    if (!chainId || !record || typeof record !== 'object') {
      return null;
    }

    const targetEventId = record.targetEventId ? String(record.targetEventId) : String(chainId);
    const createdAtRealTimeMs = Number(record.createdAtRealTimeMs ?? record.atRealTimeMs ?? Date.now());
    const expiresAtRealTimeMs = record.expiresAtRealTimeMs == null
      ? null
      : Number(record.expiresAtRealTimeMs);

    const normalized = {
      chainId: String(chainId),
      targetEventId,
      sourceEventId: record.sourceEventId ? String(record.sourceEventId) : null,
      sourceOptionId: record.sourceOptionId ? String(record.sourceOptionId) : null,
      sourceFlagId: record.sourceFlagId ? String(record.sourceFlagId) : null,
      createdAtRealTimeMs: Number.isFinite(createdAtRealTimeMs) ? createdAtRealTimeMs : Date.now(),
      expiresAtRealTimeMs: Number.isFinite(expiresAtRealTimeMs) ? expiresAtRealTimeMs : null,
      meta: record.meta && typeof record.meta === 'object' ? { ...record.meta } : {}
    };

    return normalized;
  }

  function normalizePendingChainsStore(store) {
    if (!store || typeof store !== 'object') {
      return {};
    }

    const normalized = {};
    const now = Date.now();
    const entries = Object.entries(store)
      .map(([chainId, record]) => normalizePendingChain(chainId, record))
      .filter(Boolean)
      .filter((record) => record.expiresAtRealTimeMs == null || record.expiresAtRealTimeMs > now)
      .sort((a, b) => a.createdAtRealTimeMs - b.createdAtRealTimeMs);

    const trimmed = entries.slice(Math.max(0, entries.length - MAX_PENDING_CHAINS));
    for (const record of trimmed) {
      normalized[record.chainId] = record;
    }
    return normalized;
  }

  function ensureMemory(eventsState) {
    const events = eventsState && typeof eventsState === 'object' ? eventsState : {};
    if (!events.foundation || typeof events.foundation !== 'object') {
      events.foundation = {};
    }
    if (!events.foundation.memory || typeof events.foundation.memory !== 'object') {
      events.foundation.memory = {};
    }

    const memory = events.foundation.memory;
    if (!Array.isArray(memory.events)) memory.events = [];
    if (!Array.isArray(memory.decisions)) memory.decisions = [];
    if (!memory.pendingChains || typeof memory.pendingChains !== 'object') memory.pendingChains = {};
    memory.pendingChains = normalizePendingChainsStore(memory.pendingChains);

    return memory;
  }

  function addEvent(eventsState, eventId, meta = {}) {
    if (!eventId) return;
    const memory = ensureMemory(eventsState);
    memory.events.push({ eventId: String(eventId), meta, atRealTimeMs: Date.now() });
    if (memory.events.length > 25) {
      memory.events.splice(0, memory.events.length - 25);
    }
  }

  function addDecision(eventsState, eventId, optionId, meta = {}) {
    if (!eventId || !optionId) return;
    const memory = ensureMemory(eventsState);
    memory.decisions.push({ eventId: String(eventId), optionId: String(optionId), meta, atRealTimeMs: Date.now() });
    if (memory.decisions.length > 25) {
      memory.decisions.splice(0, memory.decisions.length - 25);
    }
  }

  function getLastEvents(eventsState, count = 5) {
    const memory = ensureMemory(eventsState);
    const safeCount = Math.max(0, Number(count) || 0);
    return memory.events.slice(Math.max(0, memory.events.length - safeCount));
  }

  function getLastDecision(eventsState) {
    const memory = ensureMemory(eventsState);
    return memory.decisions.length ? memory.decisions[memory.decisions.length - 1] : null;
  }

  function setPendingChain(eventsState, chainId, data) {
    if (!chainId) return;
    const memory = ensureMemory(eventsState);
    const normalized = normalizePendingChain(chainId, data || {});
    if (!normalized) return;
    memory.pendingChains[String(chainId)] = normalized;
    memory.pendingChains = normalizePendingChainsStore(memory.pendingChains);
  }

  function getPendingChain(eventsState, chainId) {
    if (!chainId) return null;
    const memory = ensureMemory(eventsState);
    return Object.prototype.hasOwnProperty.call(memory.pendingChains, String(chainId))
      ? memory.pendingChains[String(chainId)]
      : null;
  }

  function clearPendingChain(eventsState, chainId) {
    if (!chainId) return;
    const memory = ensureMemory(eventsState);
    delete memory.pendingChains[String(chainId)];
  }

  function getPendingChains(eventsState) {
    const memory = ensureMemory(eventsState);
    return { ...memory.pendingChains };
  }

  function consumePendingChain(eventsState, chainId) {
    const chain = getPendingChain(eventsState, chainId);
    if (!chain) return null;
    clearPendingChain(eventsState, chainId);
    return chain;
  }

  function clearAllPendingChains(eventsState) {
    const memory = ensureMemory(eventsState);
    memory.pendingChains = {};
  }

  const api = Object.freeze({
    ensureMemory,
    addEvent,
    addDecision,
    getLastEvents,
    getLastDecision,
    setPendingChain,
    getPendingChain,
    getPendingChains,
    consumePendingChain,
    clearPendingChain,
    clearAllPendingChains,
    normalizePendingChainsStore
  });

  globalScope.GrowSimEventMemory = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
