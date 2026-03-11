'use strict';

(function initEventMemory(globalScope) {
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
    memory.pendingChains[String(chainId)] = data;
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

  const api = Object.freeze({
    ensureMemory,
    addEvent,
    addDecision,
    getLastEvents,
    getLastDecision,
    setPendingChain,
    getPendingChain,
    clearPendingChain
  });

  globalScope.GrowSimEventMemory = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
