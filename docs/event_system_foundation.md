# Event System Foundation (Phase 1)

## Reused existing structures

This foundation intentionally reuses the existing canonical runtime state instead of introducing a second event truth.

- Plant/simulation inputs come from `state.status`, `state.plant`, and `state.simulation`.
- Event runtime anchor remains `state.events`.
- Decision processing still happens in `onEventOptionClick` in `events.js`.
- Persistence/restore remains in `storage.js` canonicalization and merge flow.

The new foundation data is attached under:

- `state.events.foundation.flags`
- `state.events.foundation.memory`

This keeps event causality data inside the existing `events` domain and automatically included in existing state persistence.

## New foundation helpers

### 1) Normalized plant-state access

Added `src/simulation/plantState.js` with:

- `buildNormalizedPlantState(state)`

It maps current runtime fields to an event-facing view and derives missing values safely.

Mapped directly:

- `water <- status.water`
- `nutrients <- status.nutrition`
- `stress <- status.stress`
- `vitality <- status.health`
- `pestPressure <- status.risk`
- `phase <- plant.phase`
- `ageTicks <- simulation.tickCount`
- `flowerQuality <- plant.lifecycle.qualityScore` (default `0` if missing)

Derived for foundation compatibility:

- `rootHealth`
- `climateStability`
- `moldRisk`
- `yieldPotential`

### 2) Event flags

Added `src/events/eventFlags.js` with:

- `setFlag(eventsState, flag, value?)`
- `clearFlag(eventsState, flag)`
- `hasFlag(eventsState, flag)`
- `getActiveFlags(eventsState)`
- `resetFlags(eventsState)`

Flags are stored in `state.events.foundation.flags`.

### 3) Event memory

Added `src/events/eventMemory.js` with:

- `addEvent(eventsState, eventId, meta?)`
- `addDecision(eventsState, eventId, optionId, meta?)`
- `getLastEvents(eventsState, count)`
- `getLastDecision(eventsState)`
- `setPendingChain(eventsState, chainId, data)`
- `getPendingChain(eventsState, chainId)`
- `clearPendingChain(eventsState, chainId)`

Memory is stored in `state.events.foundation.memory`.

### 4) Resolver skeleton

Added `src/events/eventResolver.js` with:

- `resolveNextEvent({ state, flags, memory })`

Initial priority:

1. `root_stress_pending` flag -> `root_stress_followup`
2. high water threshold -> `drooping_leaves_warning`
3. stable conditions -> `stable_growth_reward`
4. otherwise `null`

The return payload includes reason/priority so this can later expand into phase filters, weighting layers, anti-frustration rules, and chain prioritization.

## Tiny demo catalog (3 events)

Added `data/events.foundation.json`:

1. `drooping_leaves_warning`
2. `root_stress_followup`
3. `stable_growth_reward`

Loaded in `loadEventCatalog()` and normalized via the existing `normalizeEvent` pipeline.

## Light integration of causal flow

`events.js` now performs narrow integration only:

- Resolver is consulted as a candidate override during event activation.
- Each shown event is recorded via event memory.
- When options are chosen, memory records the decision.
- `followUps` tokens now support:
  - `set_flag:<flag>`
  - `clear_flag:<flag>`
  - `set_chain:<chainId>`

This enables immediate causal flow without replacing the full event runtime.

## Minimal verification

Added `dev/verify_event_foundation.js` to deterministically verify:

1. high-water -> `drooping_leaves_warning`
2. wrong decision path can set `root_stress_pending`
3. flag then resolves -> `root_stress_followup`
4. stable conditions -> `stable_growth_reward`

## Recommended next implementation step

Implement a small **phase-aware resolver adapter** that filters resolver outputs against `allowedPhases` and introduces basic anti-repeat logic using `state.events.foundation.memory.events`, while keeping current event machine intact.
