# Offline Cap Fix

## Bug
Offline catch-up reported that simulation was capped (8 hours), but plant progression could still be derived from full wall-clock `nowMs`.

## Root cause
`syncSimulationFromElapsedTime` correctly computed a capped elapsed duration, but `applySimulationDelta` used `getPlantTimeFromElapsed(nowMs)` with absolute `nowMs`, which bypassed the cap for plant-time progression.

## What changed
- Added an explicit effective-time path in `sim.js`:
  - `resolveEffectiveSimulationNowMs(candidateNowMs, elapsedRealMs)`
  - `applySimulationDelta(elapsedRealMs, effectiveNowMs, wallNowMs)`
- `syncSimulationFromElapsedTime` now computes:
  - real elapsed offline time
  - effective capped elapsed time
  - effective capped simulation timestamp (`effectiveNowMs`)
- Offline catch-up now passes capped `effectiveNowMs` into simulation updates.
- `applySimulationDelta` now drives:
  - plant-time progression
  - sim-time delta consumers (growth, over-time effects)
  - event state-machine timing
  from the same effective timestamp.

## Resulting behavior
If offline elapsed time is greater than cap, all offline simulation outcomes are computed from cap-limited effective time. The uncapped wall-clock time is no longer used to advance plant progression during catch-up.

## Testing
- Added `test/offline-cap.test.js` with deterministic checks for:
  1. offline elapsed > cap uses capped elapsed for drift and sim progression
  2. growth/over-time sim deltas align with capped progression
  3. normal live tick behavior remains aligned for non-offline elapsed

## Remaining edge notes
- This fix is focused on offline catch-up consistency. Time-related systems (boost/resume/event scheduling) should still be monitored together in integration tests.
