'use strict';

(function initPlantStateFoundation(globalScope) {
  function toFiniteNumber(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function clamp01(value) {
    const numeric = toFiniteNumber(value, 0);
    if (numeric < 0) return 0;
    if (numeric > 100) return 100;
    return numeric;
  }

  function buildNormalizedPlantState(sourceState) {
    const root = sourceState && typeof sourceState === 'object' ? sourceState : {};
    const status = root.status && typeof root.status === 'object' ? root.status : {};
    const plant = root.plant && typeof root.plant === 'object' ? root.plant : {};
    const simulation = root.simulation && typeof root.simulation === 'object' ? root.simulation : {};

    const water = clamp01(status.water);
    const nutrients = clamp01(status.nutrition);
    const stress = clamp01(status.stress);
    const vitality = clamp01(status.health);
    const climateStability = clamp01(100 - stress);
    const pestPressure = clamp01(status.risk);

    return {
      water,
      nutrients,
      rootHealth: clamp01((vitality * 0.6) + (nutrients * 0.2) + ((100 - pestPressure) * 0.2)),
      stress,
      vitality,
      climateStability,
      pestPressure,
      moldRisk: clamp01((water * 0.45) + (pestPressure * 0.55)),
      flowerQuality: clamp01(plant.lifecycle && plant.lifecycle.qualityScore),
      yieldPotential: clamp01((vitality * 0.5) + (nutrients * 0.3) + ((100 - stress) * 0.2)),
      phase: String(plant.phase || 'seedling'),
      ageTicks: Math.max(0, Math.floor(toFiniteNumber(simulation.tickCount, 0))),
      source: {
        mappedFields: {
          water: 'status.water',
          nutrients: 'status.nutrition',
          stress: 'status.stress',
          vitality: 'status.health',
          pestPressure: 'status.risk',
          phase: 'plant.phase',
          ageTicks: 'simulation.tickCount',
          flowerQuality: 'plant.lifecycle.qualityScore'
        },
        derivedFields: ['rootHealth', 'climateStability', 'moldRisk', 'yieldPotential'],
        defaultsApplied: {
          flowerQuality: !(plant.lifecycle && Number.isFinite(Number(plant.lifecycle.qualityScore)))
        }
      }
    };
  }

  const api = Object.freeze({
    buildNormalizedPlantState
  });

  globalScope.GrowSimPlantState = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
