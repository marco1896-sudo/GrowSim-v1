const STORAGE_KEY = 'growsim.engine.state.v1';
const LAST_GOOD_KEY = 'growsim.engine.state.v1.lastGood';

export function createStorage({ throttleMs = 1500 } = {}) {
  let saveTimer = null;
  let lastSerialized = '';

  function readRaw(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (_error) {
      return null;
    }
  }

  function writeRaw(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function loadState() {
    const current = readRaw(STORAGE_KEY);
    if (current) {
      try {
        return { state: JSON.parse(current), source: 'primary' };
      } catch (_error) {
        // fall through to last-good snapshot
      }
    }

    const lastGood = readRaw(LAST_GOOD_KEY);
    if (lastGood) {
      try {
        return { state: JSON.parse(lastGood), source: 'lastGood' };
      } catch (_error) {
        return { state: null, source: 'none' };
      }
    }

    return { state: null, source: 'none' };
  }

  function persistNow(state) {
    const serialized = JSON.stringify(state);
    if (serialized === lastSerialized) {
      return false;
    }

    const okPrimary = writeRaw(STORAGE_KEY, serialized);
    const okBackup = writeRaw(LAST_GOOD_KEY, serialized);

    if (okPrimary && okBackup) {
      lastSerialized = serialized;
      return true;
    }

    return false;
  }

  function saveThrottled(state) {
    if (saveTimer !== null) {
      return;
    }

    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      persistNow(state);
    }, throttleMs);
  }

  return {
    loadState,
    persistNow,
    saveThrottled
  };
}
