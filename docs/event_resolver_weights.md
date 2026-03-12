# Event Resolver Weights

## Overview
The event resolver now supports optional per-event weight metadata to reduce repetitive patterns while preserving existing guard behavior and pending-chain precedence.

## Metadata
Event definitions may include:

```json
{
  "id": "drooping_leaves_warning",
  "weight": 5
}
```

Rules:
- `weight` is optional.
- Missing, non-finite, or non-positive values are treated as `1`.

## Selection pipeline
Resolver order remains:
1. Pending-chain override (highest precedence)
2. Forced follow-up by flag
3. Candidate construction
4. Guard pipeline (phase -> repeat -> frustration)
5. Weighted selection on surviving candidates

The weighted draw uses a standard cumulative range algorithm:
- Sum candidate weights into `totalWeight`
- Compute `weightedRoll = random() * totalWeight`
- Walk candidates in existing order, subtracting each weight
- First candidate to drop cursor below zero is selected

## Deterministic replay behavior
For replay compatibility, resolver accepts an injected deterministic RNG (`random`).
Replay harness passes the seeded generator to resolver, so weighted picks are reproducible for identical seed and inputs.

Runtime integration also injects deterministic randomness based on simulation state, so weighted selection remains stable under deterministic simulation replay.

## Trace output
Replay trace now records additional fields per tick:
- `weights`: object map of candidate event IDs to resolved weights
- `weightedRoll`: numeric roll value used for weighted selection (or `null` when selection was bypassed)

These fields make weighted resolver decisions auditable and regression-testable.
