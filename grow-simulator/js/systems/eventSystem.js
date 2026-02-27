// Event‑System: zufällige Ereignisse aus JSON laden und auslösen

let eventsList = [];

// Lade Events aus JSON‑Datei
export async function loadEvents() {
  try {
    const response = await fetch('data/events.json');
    eventsList = await response.json();
  } catch (err) {
    console.error('Fehler beim Laden der Events', err);
    eventsList = [];
  }
}

// Wandele Zeitpunkt in Gesamtminuten um
function timeToMinutes(time) {
  return time.day * 1440 + time.hour * 60 + time.minute;
}

// Prüft, ob ein neues Event ausgelöst werden soll (falls noch keines aktiv ist)
export function maybeTriggerEvent(state) {
  if (state.activeEvent) return;
  // Jedes Event hat chancePerHour; umgerechnet auf die Minute
  for (const def of eventsList) {
    const chancePerMinute = (def.chancePerHour || 0) / 60;
    if (Math.random() < chancePerMinute) {
      // Event auslösen
      state.activeEvent = {
        id: def.id,
        def,
        startedAt: timeToMinutes(state.time),
        endsAt: timeToMinutes(state.time) + def.duration * 60,
        actionTaken: false,
      };
      break;
    }
  }
}

// Wendet laufende Effekte von aktiven Events an und entfernt abgelaufene
export function updateEvents(state) {
  const event = state.activeEvent;
  if (!event) return;
  // Wenn Nutzer bereits reagiert hat, nur noch für Ablauf warten
  const now = timeToMinutes(state.time);
  // Laufende Effekte pro Minute anwenden
  const eff = event.def.effectsPerMinute || {};
  const p = state.plant;
  if (eff.water) p.water = Math.max(0, Math.min(1, p.water + eff.water));
  if (eff.nutrients) p.nutrients = Math.max(0, Math.min(1, p.nutrients + eff.nutrients));
  if (eff.health) p.health = Math.max(0, Math.min(1, p.health + eff.health));
  if (now >= event.endsAt || event.actionTaken) {
    // Event endet
    state.activeEvent = null;
  }
}

// Reaktion des Spielers auf ein Event
export function handleEventAction(state, actionIndex) {
  const event = state.activeEvent;
  if (!event) return;
  const action = event.def.actions[actionIndex];
  if (!action) return;
  const eff = action.effects || {};
  const p = state.plant;
  if (eff.water) p.water = Math.max(0, Math.min(1, p.water + eff.water));
  if (eff.nutrients) p.nutrients = Math.max(0, Math.min(1, p.nutrients + eff.nutrients));
  if (eff.health) p.health = Math.max(0, Math.min(1, p.health + eff.health));
  if (eff.growth) p.growth = Math.max(0, Math.min(1, p.growth + eff.growth));
  // Event gilt als abgehandelt
  event.actionTaken = true;
}