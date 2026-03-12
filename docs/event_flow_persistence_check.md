# Event Flow Persistence Check

## Persistence/Reload Flow Tested

This check validates one concrete causal path:

1. Active event `drooping_leaves_warning` is resolved with decision `ignore_signals`.
2. Decision creates `root_stress_followup` pending chain and updates foundation memory + analysis.
3. Runtime state is canonicalized with `syncCanonicalStateShape()` and persisted via `persistState()` (localStorage adapter path).
4. A fresh runtime context restores the serialized snapshot via `restoreState()`.
5. Reloaded runtime continues normal activation with `activateEvent()` and selects the follow-up.
6. Follow-up consumption clears pending chain and preserves causal memory links.

## Real Runtime/Storage Pieces Exercised

- `events.js`
  - `onEventOptionClick()` for real decision processing.
  - `activateEvent()` for real post-reload follow-up activation.
  - `resolveFoundationCandidateEvent()` for stale-chain pressure checks.
- `storage.js`
  - `syncCanonicalStateShape()` for canonical state shaping before save.
  - `persistState()` using `localStorageAdapter()` serialization path.
  - `restoreState()` for rehydration into fresh state.
  - `getCanonicalEvents()` assertion on persisted canonical event foundation.
- Foundation modules (`src/events/*`)
  - Memory (`pendingChains`, decisions, events)
  - Analysis store and causal linkage (`analysisId`, `relatedChainId`)
  - Flags/resolver involvement in follow-up candidate selection.

## Assertions Verified

- Decision path creates persistent causal state (pending chain + decision + analysis link).
- Canonicalization preserves required pending-chain foundation fields (`sourceEventId`, `sourceOptionId`).
- Restore rebuilds usable foundation state in a fresh runtime context.
- Post-reload activation still selects `root_stress_followup`.
- Pending chain is consumed/cleared after follow-up activation.
- Analysis + decision memory remain causally coherent (`analysisId`, `relatedChainId`).
- No stale duplicate pending chain remains after follow-up fulfillment.
- Resolver no longer reports `pending_chain:root_stress_followup` pressure once consumed.

## Narrow Bug Fixes Needed

No bug fix was required for this path; the check passed with existing implementation.

## What This Check Does Not Cover

- Multi-chain ordering conflicts or concurrent pending chains.
- Expired-chain pruning across long offline gaps.
- Backward compatibility of older legacy save formats beyond current canonical migration.
- Non-localStorage adapters or cross-device/cloud synchronization.
