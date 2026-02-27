// Interaktive Steuerungen für Buttons und Modals
import * as adSystem from '../systems/adSystem.js';
import * as eventSystem from '../systems/eventSystem.js';
import * as analysisSystem from '../systems/analysisSystem.js';

// Richte Event‑Listener ein; onStateChange wird nach Änderungen aufgerufen
export function setupControls(state, onStateChange) {
  // Werbe‑Buttons
  const skipBtn = document.getElementById('adSkipButton');
  skipBtn.addEventListener('click', () => {
    if (adSystem.useAd(state, 'skip')) {
      onStateChange(state);
    }
  });
  const rescueBtn = document.getElementById('adRescueButton');
  rescueBtn.addEventListener('click', () => {
    if (adSystem.useAd(state, 'rescue')) {
      onStateChange(state);
    }
  });
  const analysisBtn = document.getElementById('adAnalysisButton');
  analysisBtn.addEventListener('click', () => {
    if (adSystem.useAd(state, 'analysis')) {
      onStateChange(state);
      showAnalysisPanel(state);
    }
  });
  // Analyse‑Modal schließen
  const closeBtn = document.getElementById('analysisClose');
  closeBtn.addEventListener('click', () => {
    document.getElementById('analysisModal').classList.add('hidden');
  });
}

// Zeige Event‑Modal an
export function showEventModal(eventDef, state, onStateChange) {
  const modal = document.getElementById('eventModal');
  const titleEl = document.getElementById('eventTitle');
  const descEl = document.getElementById('eventDescription');
  const actionsContainer = document.getElementById('eventActions');
  titleEl.textContent = eventDef.name;
  descEl.textContent = eventDef.description;
  // alte Buttons entfernen
  actionsContainer.innerHTML = '';
  eventDef.actions.forEach((action, index) => {
    const btn = document.createElement('button');
    btn.textContent = action.label;
    btn.className = 'action-button';
    btn.addEventListener('click', () => {
      eventSystem.handleEventAction(state, index);
      modal.classList.add('hidden');
      onStateChange(state);
    });
    actionsContainer.appendChild(btn);
  });
  modal.classList.remove('hidden');
}

// Analyse‑Panel anzeigen (nur wenn freigeschaltet)
export function showAnalysisPanel(state) {
  if (!state.analysisUnlocked) return;
  const modal = document.getElementById('analysisModal');
  const content = document.getElementById('analysisContent');
  const result = analysisSystem.getAnalysis(state);
  // HTML‑Inhalt generieren
  content.innerHTML = `
    <h3>Analyse</h3>
    <p><strong>Symptome:</strong> ${result.issues.join(', ')}</p>
    <p><strong>Risiken:</strong> ${result.risks.join(', ')}</p>
    <p><strong>Empfehlungen:</strong> ${result.recommendations.join(', ')}</p>
  `;
  modal.classList.remove('hidden');
}