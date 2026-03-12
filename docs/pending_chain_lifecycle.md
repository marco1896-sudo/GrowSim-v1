# Pending Chain Lifecycle

## Problem (before)

Pending follow-up chains existed as a write path, but lifecycle handling was incomplete:
- chains could be written without a consistent normalized shape,
- resolver behavior did not consistently read pending-chain records,
- consumed follow-ups did not always remove pending-chain state,
- stale/malformed pending data from older saves could linger.

This made pending-chain state prone to becoming stale causal residue.

## Current lifecycle

Pending chains now follow an explicit lifecycle in `src/events/eventMemory.js`:

1. **Create / set**
   - `setPendingChain(eventsState, chainId, data)`
   - records are normalized to a bounded structure (`chainId`, `targetEventId`, source metadata, timestamps, optional expiry).

2. **Read / inspect**
   - `getPendingChain(eventsState, chainId)`
   - `getPendingChains(eventsState)`

3. **Consume on fulfillment**
   - `consumePendingChain(eventsState, chainId)` returns the consumed record and removes it.
   - Event activation path in `events.js` consumes a chain when the matching event is selected.

4. **Clear on invalidation**
   - `clearPendingChain(eventsState, chainId)`
   - `clearAllPendingChains(eventsState)` (available, but not broadly used).
   - Existing flow also clears root-stress pending chain when clearing `root_stress_pending` flag.

5. **Bounded / safe**
   - pending chains are normalized and capped (`MAX_PENDING_CHAINS = 12`).
   - expired chains are pruned automatically during normalization.

## Storage location

Pending chains are stored at:

- `state.events.foundation.memory.pendingChains`

Each chain is keyed by `chainId` and normalized into a safe object record.

## Resolver integration

`src/events/eventResolver.js` now checks most-recent pending chain via memory facade (`getPendingChains`) before standard condition resolution.

- If valid and phase-allowed, pending chain target event is selected with `pending_chain:<id>` reason.
- If blocked by phase/catalog constraints, resolver falls through safely.

## Decision flow integration

In `events.js` follow-up handling:

- setting `root_stress_pending` flag now bridges to a pending chain for `root_stress_followup`.
- explicit `set_chain:*` and `clear_chain:*` follow-up tokens are supported.
- when an event is activated, matching pending chain is consumed immediately.
- stable path cleanup clears obsolete root-stress pending chain.

## Persistence / restore safety

`storage.js` canonicalization now normalizes pending chain entries and drops malformed records:
- supports legacy shape (`eventId`, `optionId`, `atRealTimeMs`) migration into normalized fields,
- prunes invalid entries,
- preserves valid chain state across restore.

## Out of scope (intentionally)

- No broad event catalog redesign.
- No UI redesign for chain visualization.
- No workflow-engine abstraction beyond narrow lifecycle helpers.
