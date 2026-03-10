'use strict';

function showServiceWorkerHint() {
  if (document.getElementById('swHintBanner')) {
    return;
  }
  const banner = document.createElement('div');
  banner.id = 'swHintBanner';
  banner.className = 'boot-error-banner boot-warning-banner';
  banner.innerHTML = '<strong>Service Worker noch nicht aktiv – bitte einmal normal neu laden.</strong>';
  document.body.appendChild(banner);
}

async function schedulePushIfAllowed(_force) {
  // Lokale Benachrichtigungen nutzen aktuell kein Backend-Push-Scheduling.
}

function canNotify(type) {
  const notifications = getCanonicalNotificationsSettings(state);
  if (notifications.enabled !== true) {
    return false;
  }

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return false;
  }

  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    return false;
  }

  if (type && notifications.types[type] !== true) {
    return false;
  }

  return true;
}

function notify(type, title, body) {
  if (!canNotify(type)) {
    return;
  }

  const tagByType = {
    events: 'gs-events',
    critical: 'gs-critical',
    reminder: 'gs-reminder'
  };
  const tag = tagByType[type] || 'gs-generic';

  navigator.serviceWorker.controller.postMessage({
    type: 'GS_SHOW_NOTIFICATION',
    title,
    options: {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag
    }
  });
}

function evaluateNotificationTriggers(nowMs) {
  notifyEventAvailability();
  notifyCriticalState(nowMs);
  notifyReminder(nowMs);
}

function notifyEventAvailability() {
  if (state.events.machineState !== 'activeEvent') {
    return;
  }

  const notifications = getCanonicalNotificationsSettings(state);
  const eventId = state.events.activeEventId || null;
  if (!eventId || notifications.runtime.lastNotifiedEventId === eventId) {
    return;
  }

  notify('events', 'Grow Simulator', 'Ein Ereignis ist verfügbar. Tippe, um zu reagieren.');
  notifications.runtime.lastNotifiedEventId = eventId;
}

function notifyCriticalState(nowMs) {
  const s = state.status || {};
  const critical = Number(s.health) <= 15 || Number(s.risk) >= 75 || Number(s.stress) >= 80;
  if (!critical) {
    return;
  }

  const scores = [
    { key: 'health', score: Math.max(0, 15 - Number(s.health || 0)) },
    { key: 'risk', score: Math.max(0, Number(s.risk || 0) - 75) },
    { key: 'stress', score: Math.max(0, Number(s.stress || 0) - 80) }
  ].sort((a, b) => b.score - a.score || String(a.key).localeCompare(String(b.key)));

  let body = 'Kritischer Zustand: Gesundheit sehr niedrig.';
  if (scores[0].key === 'risk') {
    body = 'Kritischer Zustand: Risiko ist sehr hoch.';
  } else if (scores[0].key === 'stress') {
    body = 'Kritischer Zustand: Stress ist extrem hoch.';
  }

  notify('critical', 'Grow Simulator', body);
  notifications.runtime.lastCriticalAtRealMs = nowMs;
}

async function schedulePushIfAllowed(_force) {
  // Lokale Benachrichtigungen nutzen aktuell kein Backend-Push-Scheduling.
}

function notifyReminder(nowMs) {
  const actions = Array.isArray(state.history && state.history.actions) ? state.history.actions : [];
  const lastActionAtMs = actions.length
    ? Number(actions[actions.length - 1].atRealTimeMs || actions[actions.length - 1].realTime || 0)
    : 0;

  const inactivityMs = 90 * 60 * 1000;
  if (lastActionAtMs > 0 && (nowMs - lastActionAtMs) < inactivityMs) {
    return;
  }

  const s = state.status || {};
  const notOptimal = Number(s.water) < 50 || Number(s.nutrition) < 50 || Number(s.stress) > 55;
  if (!notOptimal) {
    return;
  }

  const notifications = getCanonicalNotificationsSettings(state);
  const cooldownMs = 120 * 60 * 1000;
  if ((nowMs - notifications.runtime.lastReminderAtRealMs) < cooldownMs) {
    return;
  }

  notify('reminder', 'Grow Simulator', 'Deine Pflanze braucht Pflege. Öffne die App für eine Maßnahme.');
  notifications.runtime.lastReminderAtRealMs = nowMs;
}

function notifyPlantNeedsCare(bodyText) {
  if (!state.settings || state.settings.pushNotificationsEnabled !== true) {
    return;
  }

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return;
  }

  if (!('serviceWorker' in navigator)) {
    return;
  }

  const payload = {
    type: 'SHOW_NOTIFICATION',
    title: 'GrowSim',
    options: {
      body: String(bodyText || 'Deine Pflanze braucht Pflege.'),
      icon: '/icons/icon-192.png'
    }
  };

  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage(payload);
    return;
  }

  navigator.serviceWorker.ready
    .then((registration) => {
      if (registration && registration.active) {
        registration.active.postMessage(payload);
      }
    })
    .catch(() => {
      // non-fatal
    });
}

async function postJsonStub(url, payload) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    addLog('system', `Stub-Endpunkt fehlgeschlagen: ${url}`, { error: error.message });
  }
}

function base64ToU8(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const normalized = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function dbGet(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const store = tx.objectStore(DB_STORE);
    const request = store.get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

function dbSet(db, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const request = store.put(value, key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

function dbDelete(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const request = store.delete(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

