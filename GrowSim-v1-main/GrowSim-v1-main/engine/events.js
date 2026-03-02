import { createPrngContext, weightedPickStable } from './prng.js';

function cleanupActiveEvents(plant, tickIndex) {
  const remaining = [];

  for (const instance of plant.active_events) {
    if (instance.end_tick <= tickIndex) {
      const cdTicks = Math.max(0, Number(instance.cooldown_ticks) || 0);
      if (cdTicks > 0) {
        plant.cooldowns[instance.event_id] = {
          event_id: instance.event_id,
          cooldown_ticks_total: cdTicks,
          cooldown_ticks_left: cdTicks,
          set_at_tick: tickIndex,
          expires_at_tick: tickIndex + cdTicks,
          reason: 'ended'
        };
      }
      continue;
    }

    remaining.push(instance);
  }

  plant.active_events = remaining;
}

function decrementCooldowns(plant) {
  const ids = Object.keys(plant.cooldowns).sort();
  for (const id of ids) {
    const cd = plant.cooldowns[id];
    cd.cooldown_ticks_left -= 1;
    if (cd.cooldown_ticks_left <= 0) {
      delete plant.cooldowns[id];
    }
  }
}

function isEligibleByStage(plant, eventDef) {
  if (Number.isInteger(eventDef.min_stage) && plant.growth_stage < eventDef.min_stage) return false;
  if (Number.isInteger(eventDef.max_stage) && plant.growth_stage > eventDef.max_stage) return false;
  return true;
}

function buildEligibleList(plant, eventDefs) {
  const eligible = [];
  for (const eventDef of eventDefs) {
    if (plant.cooldowns[eventDef.id]) continue;
    if (plant.active_events.some((ev) => ev.event_id === eventDef.id)) continue;
    if (!isEligibleByStage(plant, eventDef)) continue;
    if (!eventDef.compiledTrigger(plant)) continue;
    eligible.push(eventDef);
  }
  return eligible;
}

function topPriorityBand(eligible) {
  if (eligible.length === 0) return [];
  let maxPriority = eligible[0].priority;
  for (let i = 1; i < eligible.length; i += 1) {
    if (eligible[i].priority > maxPriority) {
      maxPriority = eligible[i].priority;
    }
  }
  return eligible.filter((item) => item.priority === maxPriority);
}

function spawnEvent(plant, eventDef, tickIndex) {
  plant.active_events.push({
    instance_id: `${eventDef.id}@${tickIndex}`,
    event_id: eventDef.id,
    priority: eventDef.priority,
    start_tick: tickIndex,
    end_tick: tickIndex + eventDef.duration_ticks,
    duration_ticks_total: eventDef.duration_ticks,
    cooldown_ticks: eventDef.cooldown_ticks
  });
}

export function processEventTick({ state, eventCatalog, rules, tickIndex }) {
  const plants = Object.keys(state.plants).sort();

  for (const plantId of plants) {
    const plant = state.plants[plantId];

    cleanupActiveEvents(plant, tickIndex);
    decrementCooldowns(plant);

    const capacity = Math.max(0, rules.max_active_events - plant.active_events.length);
    if (capacity <= 0) continue;

    const budget = Math.max(0, Math.min(rules.spawn_budget_per_tick, capacity));
    for (let slot = 0; slot < budget; slot += 1) {
      const eligible = buildEligibleList(plant, eventCatalog.events);
      const band = topPriorityBand(eligible);
      if (band.length === 0) break;

      const prng = createPrngContext({
        globalSeed: state.global_seed,
        plantId,
        tickIndex,
        purpose: `event_spawn_${slot}`
      });

      const picked = weightedPickStable(band, (item) => item.weight, prng);
      if (!picked) break;
      spawnEvent(plant, picked, tickIndex);
    }
  }
}
