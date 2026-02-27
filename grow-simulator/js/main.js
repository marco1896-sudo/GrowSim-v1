// Einstiegspunkt für die Grow Simulator Web‑App
import { startEngine } from './core/engine.js';
import { loadState, saveState } from './core/state.js';
import { loadEvents } from './systems/eventSystem.js';
import { render } from './ui/render.js';
import { setupControls, showEventModal } from './ui/controls.js';

// Globale Variable, um doppelte Anzeige derselben Event‑Modal zu verhindern
let currentEventId = null;

async function init() {
  // Zustand laden
  const state = loadState();
  // Event‑Daten laden
  await loadEvents();
  // Controls initialisieren
  setupControls(state, onTick);
  // Erste Darstellung
  render(state);
  // Engine starten
  startEngine(onTick);

  // Callback für jeden Tick
  function onTick(newState) {
    render(newState);
    // Event‑Modal bei neuem Event anzeigen
    if (newState.activeEvent && newState.activeEvent.id !== currentEventId) {
      showEventModal(newState.activeEvent.def, newState, onTick);
      currentEventId = newState.activeEvent.id;
    }
    if (!newState.activeEvent) {
      currentEventId = null;
    }
    // Zustand speichern
    saveState(newState);
  }
}

// DOM Ready
document.addEventListener('DOMContentLoaded', init);