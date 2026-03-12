# Boost Semantics Fix

## Previous mismatch
The button wording (`+30 Min beschleunigen`) implied a full 30-minute simulation skip for the plant.
In reality, boost behavior was mixed:
- plant simulation was only nudged (`applyStatusDrift` for 3 minutes + `+2%` growth)
- event timers were advanced by 30 real minutes

This made player expectation inconsistent with the actual mechanic.

## Chosen model
**Option B — Honest limited boost** was implemented.

Reason: It is the safer change for gameplay stability because existing event scheduling and progression architecture already use mixed real-time + sim-time flows. Reframing the feature removes the semantic mismatch without risky rewrites.

## What changed
1. UI label now explicitly states event-time acceleration:
   - `Ereignis-Boost (-30 Min Eventzeit)`
2. HUD helper text now clarifies scope:
   - `Event -30 Min · kleiner Pflanzenimpuls · X/6 heute`
3. Action log text now explicitly describes both effects:
   - `Ereignis-Boost angewendet (Event-Timer -30 Min, Pflanze leicht angestoßen)`
4. Code comments document that this is intentionally limited (not a full simulation skip).

## Current boost behavior
When boost is pressed (if not dead and daily cap not reached):
- consumes 1 boost usage (up to 6/day)
- applies a limited plant effect:
  - status drift for 3 minutes
  - growth +2%
- accelerates event timing by 30 minutes where state-machine-safe:
  - next event timer in `idle`/`cooldown`
  - cooldown timer in `cooldown`
  - resolving timer in `resolving`
- runs event state machine and re-renders UI

## Verification
A focused deterministic helper was added:
- `dev/verify_boost_semantics.js`

It verifies:
- wording now communicates limited/event-focused behavior
- code still applies the intended limited plant effect
- event timer acceleration logic remains present and scoped

## Remaining caveats
This fix intentionally does **not** convert boost into a full 30-minute plant simulation skip.
If full time skip is desired later, that should be implemented as a dedicated architecture change aligning offline catch-up, event scheduler transitions, and stage progression.
