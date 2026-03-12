# Event Resolver Pools

## Short analysis
Current runtime catalogs already expose metadata that supports lightweight pooling:
- `category`
- `tone`
- `isFollowUp`
- `allowedPhases`
- `tags`
- (newer events) `weight`

This creates an implicit pool structure today (warnings, rewards, follow-up recovery paths) even without explicit pool metadata.

Chosen design: add **optional** `pool` metadata for clarity (`warning`, `reward`, `recovery`, `stress`, `rare`), but keep safe inference so old events continue to work unchanged.

## Pool model
Events can optionally define:

```json
{
  "id": "drooping_leaves_warning",
  "pool": "warning"
}
```

If missing, resolver infers pool in this order:
1. `tags` contains `rare` -> `rare`
2. follow-up (`isFollowUp` or forced follow-up candidate) -> `recovery`
3. reward-like (`tags` includes `reward`, positive `tone`, or `category=positive`) -> `reward`
4. negative/warning-like (`tone=negative` or category in disease/pest/water/nutrition/environment) -> `warning`
5. fallback -> `stress`

## Resolver flow (with pools)
Resolver behavior remains:
1. pending-chain override
2. forced follow-up by flag
3. candidate generation
4. phase/repeat/frustration guard pipeline
5. pool grouping
6. pool selection
7. weighted event selection inside selected pool

## Pool selection behavior
When multiple pools are available:
- each pool weight starts as sum of candidate event weights in that pool
- `rare` pool gets a damping multiplier (`0.35`)
- if recent history is negative-heavy (two recent negative events), `recovery` and `reward` pools get a preference multiplier (`2.5`) when present
- selected pool is chosen by deterministic weighted roll from injected RNG

Then event selection uses existing weighted event draw inside that chosen pool.

## Determinism and replay
No nondeterministic randomness is introduced.
- resolver receives an injected deterministic RNG (`random`)
- replay harness uses seeded RNG and records pool decisions

Replay trace includes:
- `availablePools`
- `selectedPool`
- `poolWeights`
- `poolRoll`
- `poolReason`
- existing `weights` and `weightedRoll`

## Interaction with guards and precedence
- Guard logic is unchanged.
- Pending-chain precedence remains unchanged.
- Forced follow-up by flag still bypasses normal pool routing.
- Weight behavior is preserved and now applied within selected pool.

## What remains for later
- richer pool-specific balancing from broader catalogs
- optional authoring lint for pool coverage
- explicit phase-aware pool heuristics (if needed)
