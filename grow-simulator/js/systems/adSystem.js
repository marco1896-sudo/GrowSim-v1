// Simuliertes Werbesystem: Limitiert die Anzahl an Ads pro Tag und führt deren Wirkung aus
import { defaultState } from '../core/state.js';

export const MAX_ADS_PER_DAY = 6;

// Zurücksetzen der Ad‑Zähler bei neuem Tag
export function resetAdsIfNewDay(state) {
  if (state.time.day !== state.lastDay) {
    state.adsUsedToday = 0;
    state.lastDay = state.time.day;
    state.analysisUnlocked = false;
  }
}

// Prüft, ob noch Ads verwendet werden dürfen
export function canUseAd(state) {
  return state.adsUsedToday < MAX_ADS_PER_DAY;
}

// Verwendung eines Ads mit Typ: 'skip' | 'rescue' | 'analysis'
// Rückgabe true, wenn Ad genutzt wurde
export function useAd(state, type) {
  if (!canUseAd(state)) return false;
  state.adsUsedToday++;
  if (type === 'skip') {
    // Vorspulen um 30 Ingame‑Minuten
    addMinutes(state, 30);
  } else if (type === 'rescue') {
    // Gesundheit um 30 % erhöhen
    state.plant.health = Math.min(1, state.plant.health + 0.3);
  } else if (type === 'analysis') {
    // Analyse freischalten
    state.analysisUnlocked = true;
  }
  return true;
}

// Hilfsfunktion zum Hinzufügen von Minuten zur Spielzeit
function addMinutes(state, minutes) {
  state.time.minute += minutes;
  while (state.time.minute >= 60) {
    state.time.minute -= 60;
    state.time.hour += 1;
    if (state.time.hour >= 24) {
      state.time.hour = 0;
      state.time.day += 1;
    }
  }
}