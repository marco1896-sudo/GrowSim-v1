// Rendering‑Funktionen für die Grow Simulator UI
import { MAX_ADS_PER_DAY, canUseAd } from '../systems/adSystem.js';

// Aktualisiere sämtliche UI‑Elemente basierend auf dem aktuellen Zustand
export function render(state) {
  // Zeit
  const dayEl = document.getElementById('dayDisplay');
  const timeEl = document.getElementById('timeDisplay');
  dayEl.textContent = `Tag ${state.time.day}`;
  const hh = String(state.time.hour).padStart(2, '0');
  const mm = String(state.time.minute).padStart(2, '0');
  timeEl.textContent = `${hh}:${mm}`;
  // Ads verbleibend
  const adsLeftEl = document.getElementById('adsLeft');
  adsLeftEl.textContent = `${Math.max(0, MAX_ADS_PER_DAY - state.adsUsedToday)}`;
  // Plant Stage
  document.getElementById('stageDisplay').textContent = stageLabel(state.plant.stage);
  // Gauges
  updateGauge('healthGauge', state.plant.health);
  updateGauge('growthGauge', state.plant.growth);
  // Bars
  updateBar('waterBar', state.plant.water);
  updateBar('nutrientBar', state.plant.nutrients);
  // Buttons: Aktivierung/Deaktivierung
  const skipBtn = document.getElementById('adSkipButton');
  const rescueBtn = document.getElementById('adRescueButton');
  const analysisBtn = document.getElementById('adAnalysisButton');
  skipBtn.disabled = !canUseAd(state);
  analysisBtn.disabled = !canUseAd(state) || state.analysisUnlocked;
  rescueBtn.disabled = !canUseAd(state) || state.plant.health > 0.4;
}

// Gauge aktualisieren: setzt CSS‑Variablen und Werttext
function updateGauge(id, value) {
  const gauge = document.getElementById(id);
  gauge.style.setProperty('--gauge-value', value);
  const valueEl = gauge.querySelector('.gauge-value');
  valueEl.textContent = `${Math.round(value * 100)}%`;
}

// Balken aktualisieren
function updateBar(id, value) {
  const fill = document.getElementById(id);
  const pct = Math.max(0, Math.min(1, value)) * 100;
  fill.style.width = `${pct}%`;
}

function stageLabel(stage) {
  switch (stage) {
    case 'seedling':
      return 'Keimling';
    case 'veg':
      return 'Wachstum';
    case 'flower':
      return 'Blüte';
    default:
      return stage;
  }
}