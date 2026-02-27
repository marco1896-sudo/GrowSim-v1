// Stateverwaltung für den Grow Simulator
// Dieses Modul hält den zentralen Spielzustand, lädt und speichert ihn in localStorage
export const defaultState = {
  time: {
    day: 1,
    hour: 8,
    minute: 0,
  },
  plant: {
    water: 1.0,      // zwischen 0 und 1
    nutrients: 1.0,  // zwischen 0 und 1
    health: 1.0,     // zwischen 0 und 1
    growth: 0.0,     // zwischen 0 und 1
    stage: 'seedling',
  },
  adsUsedToday: 0,
  lastDay: 1,
  analysisUnlocked: false,
  activeEvent: null, // aktuelles Event (falls vorhanden)
};

// Lese Zustand aus localStorage oder nutze Standard
export function loadState() {
  try {
    const stored = localStorage.getItem('growState');
    if (stored) {
      const parsed = JSON.parse(stored);
      return Object.assign({}, defaultState, parsed);
    }
  } catch (err) {
    console.warn('Fehler beim Laden des Zustands', err);
  }
  // Fallback: Kopie des Standardzustands zurückgeben
  return JSON.parse(JSON.stringify(defaultState));
}

// Zustand in localStorage persistieren
export function saveState(state) {
  try {
    localStorage.setItem('growState', JSON.stringify(state));
  } catch (err) {
    console.warn('Fehler beim Speichern des Zustands', err);
  }
}