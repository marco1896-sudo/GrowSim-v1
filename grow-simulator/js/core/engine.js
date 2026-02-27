// Tick‑Engine für den Grow Simulator
// Diese Engine aktualisiert Zeit, Pflanze, Events und Ads in festen Intervallen
import { loadState, saveState } from './state.js';
import { updatePlant } from '../systems/plantSystem.js';
import { updateEvents, maybeTriggerEvent } from '../systems/eventSystem.js';
import { resetAdsIfNewDay } from '../systems/adSystem.js';

// Starte die Engine und rufe onTick bei jedem Tick auf
// onTick erhält immer eine Referenz auf denselben State
export function startEngine(onTick) {
  const state = loadState();
  // beim Start tägliche Ads ggf. zurücksetzen
  resetAdsIfNewDay(state);
  // initiales Rendern
  onTick(state);
  // Tick‑Intervall in Millisekunden (1 Sekunde = 1 Ingame‑Minute)
  const interval = 1000;
  const timer = setInterval(() => {
    advanceTime(state);
    // Systems aufrufen
    updatePlant(state);
    updateEvents(state);
    maybeTriggerEvent(state);
    resetAdsIfNewDay(state);
    saveState(state);
    onTick(state);
  }, interval);
  return timer;
}

// Zeitfortschritt im Spiel
function advanceTime(state) {
  state.time.minute += 1;
  if (state.time.minute >= 60) {
    state.time.minute = 0;
    state.time.hour += 1;
  }
  if (state.time.hour >= 24) {
    state.time.hour = 0;
    state.time.day += 1;
  }
}