import { computeDifficultyFromTick } from './scaling.js';
import { processEventTick } from './events.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function distanceFromBand(value, low, high) {
  if (value < low) return low - value;
  if (value > high) return value - high;
  return 0;
}

function computeBandMultiplier(value, low, high, excessPenaltyScale) {
  if (value < low) {
    return clamp(value / low, 0, 1);
  }
  if (value <= high) {
    return 1;
  }
  const ratio = (value - high) / (100 - high);
  return clamp(1 - ratio * excessPenaltyScale, 0, 1);
}

function getStage(stageList, stageIndex) {
  if (!Array.isArray(stageList) || stageList.length === 0) {
    return {
      base_growth_per_tick: 0,
      threshold_points: Number.POSITIVE_INFINITY,
      water_drain_per_tick: 0,
      nutrition_drain_per_tick: 0
    };
  }
  const safeIndex = clamp(stageIndex, 0, stageList.length - 1);
  return stageList[safeIndex];
}

function processPlantTick(plant, stageList, rules) {
  const stage = getStage(stageList, plant.growth_stage);

  const deltaGBase = Number(stage.base_growth_per_tick) || 0;
  const growthIntensity = deltaGBase > 0 ? clamp((plant.last_tick_growth_delta || deltaGBase) / deltaGBase, 0, 1.25) : 1;

  // a) resource drift
  const waterDrain = (Number(stage.water_drain_per_tick) || 0) * (0.8 + growthIntensity);
  const nutritionDrain = (Number(stage.nutrition_drain_per_tick) || 0) * (0.7 + growthIntensity);

  plant.water = clamp(plant.water - waterDrain, 0, 100);
  plant.nutrition = clamp(plant.nutrition - nutritionDrain, 0, 100);

  // b) stress (+recovery)
  const wBand = rules.ideal_bands.water;
  const nBand = rules.ideal_bands.nutrition;

  const dW = distanceFromBand(plant.water, wBand.low, wBand.high);
  const dN = distanceFromBand(plant.nutrition, nBand.low, nBand.high);
  const pW = clamp(dW / 50, 0, 1);
  const pN = clamp(dN / 50, 0, 1);

  const stressAdd = pW * rules.stress_constants.kW + pN * rules.stress_constants.kN;
  plant.stress = clamp(plant.stress + stressAdd, 0, 100);

  const inIdealBands = dW === 0 && dN === 0;
  if (inIdealBands) {
    plant.stress = clamp(plant.stress - rules.stress_constants.stress_recovery_per_tick, 0, 100);
  }

  // c) health delta (recovery intentionally disabled in 3A)
  const damageRate = rules.health_constants.damage_rate;
  plant.health = clamp(plant.health - Math.max(0, plant.stress - 30) * damageRate, 0, 100);

  // d) growth ΔG (no event multipliers yet)
  const mVigor = clamp((plant.health / 100) * (1 - plant.stress / 120), 0, 1.1);
  const mWater = computeBandMultiplier(plant.water, wBand.low, wBand.high, 0.4);
  const mNutrition = computeBandMultiplier(plant.nutrition, nBand.low, nBand.high, 0.25);
  const mEnvironment = 1;
  const mEvent = 1;

  const deltaG = deltaGBase * mVigor * mWater * mNutrition * mEnvironment * mEvent;
  plant.growth_points += deltaG;
  plant.vigor = mVigor;
  plant.last_tick_growth_delta = deltaG;

  // e) stage progression with carry-over remainder
  while (true) {
    const current = getStage(stageList, plant.growth_stage);
    const threshold = Number(current.threshold_points) || Number.POSITIVE_INFINITY;
    if (!(plant.growth_points >= threshold)) {
      break;
    }

    const hasNext = plant.growth_stage < stageList.length - 1;
    if (!hasNext) {
      plant.growth_points = threshold;
      break;
    }

    plant.growth_points -= threshold;
    plant.growth_stage += 1;
  }
}

export function runSimulationTick({ state, data, tickIndex }) {
  const { daysSinceStart, D } = computeDifficultyFromTick({
    tickIndex,
    tickSeconds: state.tick_seconds,
    difficultyRampDays: data.rules.difficulty_ramp_days
  });

  state.difficulty_days_since_start = daysSinceStart;
  state.difficulty_scalar_D = D;

  const plantIds = Object.keys(state.plants).sort();
  for (const plantId of plantIds) {
    const plant = state.plants[plantId];
    processPlantTick(plant, data.stages.stages, data.rules);
    plant.plant_tick_index += 1;
    plant.last_processed_global_tick = tickIndex;
  }

  // f) fixed-order event processing after base simulation math
  processEventTick({
    state,
    eventCatalog: data.events,
    rules: data.rules,
    tickIndex
  });
}
