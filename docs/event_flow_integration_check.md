# Event Flow Integration Check

## Chosen flow

This check simulates a realistic runtime path using the existing event runtime functions in `events.js`:

1. `drooping_leaves_warning` is active.
2. Player chooses `ignore_signals` via `onEventOptionClick`.
3. Foundation follow-up handling creates `root_stress_pending` and pending chain `root_stress_followup`.
4. Outcome analysis is generated and linked to the recorded decision.
5. A scheduler-like next activation pass is executed via `activateEvent`.
6. Resolver prioritizes the pending chain and activates `root_stress_followup`.
7. Pending chain is consumed, and memory/analysis context remains coherent.

## Why this flow is realistic enough

- It uses the real runtime decision path (`onEventOptionClick`) instead of directly writing to memory.
- It uses the real event activation path (`activateEvent`) and foundation resolver hook (`resolveFoundationCandidateEvent`).
- It validates the same state transitions that happen during normal gameplay event cycles (decision, resolution, cooldown handoff, next activation).

## Runtime pieces exercised

- `events.js`
  - `onEventOptionClick`
  - `applyFoundationFollowUps`
  - `resolveFoundationCandidateEvent`
  - `activateEvent`
- Foundation modules
  - `src/events/eventMemory.js`
  - `src/events/eventFlags.js`
  - `src/events/eventAnalysis.js`
  - `src/events/eventResolver.js`
  - `src/simulation/plantState.js`

## Assertions verified

The check verifies all core integration goals for one causal chain:

1. Decision creates a pending chain.
2. Decision sets the expected follow-up flag.
3. Decision is stored in memory.
4. Analysis is generated and linked to the decision.
5. Analysis keeps causal chain context (`relatedChainId`).
6. Next activation pass selects the follow-up event through resolver/runtime flow.
7. Follow-up activation consumes/clears the pending chain.
8. Event memory for activated follow-up retains consumed-chain/source metadata.
9. Resolver output after consumption no longer reports stale pending-chain pressure.

## Narrow bug fixes needed

No production bug fix was required for this path.

Only test harness scaffolding was added to provide runtime globals needed by `events.js` when executed in a Node VM context.

## What this check does NOT cover

- Full browser/UI rendering path.
- Full scheduler timing randomness and long-run event cadence.
- Other follow-up token variants beyond the tested `set_flag:root_stress_pending` bridge.
- Cross-session persistence/reload behavior.
- Multi-chain contention and priority ordering among several simultaneous pending chains.
