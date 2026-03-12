# Event Flow Multi-Chain Persistence Check

## Multi-Chain Flow Tested

This check validates a two-chain save/load continuation path:

1. Two pending chains are created before save:
   - `root_stress_followup` (older)
   - `humidity_lock_followup` (newer)
2. State is canonicalized and persisted through `syncCanonicalStateShape()` + `persistState()`.
3. Fresh runtime restores the snapshot through `restoreState()`.
4. Resolver/activation runs twice post-reload and must consume chains in deterministic order.

## Precedence Rule Assumed and Verified

The check verifies the precedence rule already implied by the resolver implementation:

- Resolver selects the **most recent pending chain first**, based on `createdAtRealTimeMs` descending.
- This means `humidity_lock_followup` (newer timestamp) must activate before `root_stress_followup`.

This is the narrowest safe rule because it is explicitly encoded in `getMostRecentPendingChain()` and does not require introducing new priority systems.

## Real Runtime/Storage Pieces Exercised

- `events.js`
  - `activateEvent()` for post-reload follow-up activation and consumption.
  - `resolveFoundationCandidateEvent()` for pending-chain precedence checks.
- `storage.js`
  - `syncCanonicalStateShape()` for canonical shaping prior to save.
  - `persistState()` using localStorage adapter path.
  - `restoreState()` for fresh-runtime reconstruction.
  - `getCanonicalEvents()` verification of preserved chain data.
- Foundation helpers
  - `eventMemory.setPendingChain/getPendingChains/getPendingChain`.
  - Resolver pending-chain path via `eventResolver.getMostRecentPendingChain` behavior.

## Assertions Verified

- Two pending chains coexist pre-save.
- Canonicalized snapshot preserves both chain records and timestamp ordering signal.
- Restore reconstructs both chains for resolver/runtime use.
- First post-reload activation selects and consumes only the newer chain.
- Second post-reload activation selects and consumes the remaining older chain.
- Event memory metadata (`consumedChainId`, `sourceEventId`) remains causally coherent.
- No stale duplicate pending pressure remains after both chains are consumed.

## Narrow Bug Fixes Needed

No bug fix was required; current behavior already satisfied deterministic most-recent-first ordering.

## What This Check Does Not Cover

- Tie-breaking when two chains share identical timestamps.
- Priority policies beyond timestamp recency.
- Long-offline expiration pruning interactions with multi-chain ordering.
- Multi-chain behavior where target events are phase-blocked or missing from catalog.
