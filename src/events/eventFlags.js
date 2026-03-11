'use strict';

(function initEventFlags(globalScope) {
  function ensureFoundation(eventsState) {
    const events = eventsState && typeof eventsState === 'object' ? eventsState : {};
    if (!events.foundation || typeof events.foundation !== 'object') {
      events.foundation = {};
    }
    if (!events.foundation.flags || typeof events.foundation.flags !== 'object') {
      events.foundation.flags = {};
    }
    return events.foundation.flags;
  }

  function setFlag(eventsState, flag, value = true) {
    if (!flag) return;
    const flags = ensureFoundation(eventsState);
    flags[String(flag)] = value;
  }

  function clearFlag(eventsState, flag) {
    if (!flag) return;
    const flags = ensureFoundation(eventsState);
    delete flags[String(flag)];
  }

  function hasFlag(eventsState, flag) {
    if (!flag) return false;
    const flags = ensureFoundation(eventsState);
    return Boolean(flags[String(flag)]);
  }

  function getActiveFlags(eventsState) {
    const flags = ensureFoundation(eventsState);
    return Object.keys(flags).filter((flag) => Boolean(flags[flag]));
  }

  function resetFlags(eventsState) {
    const flags = ensureFoundation(eventsState);
    for (const key of Object.keys(flags)) {
      delete flags[key];
    }
  }

  const api = Object.freeze({
    ensureFoundation,
    setFlag,
    clearFlag,
    hasFlag,
    getActiveFlags,
    resetFlags
  });

  globalScope.GrowSimEventFlags = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
