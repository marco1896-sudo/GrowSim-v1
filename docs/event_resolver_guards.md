# Event Resolver Guards

## Purpose

A lightweight resolver guard layer improves fairness and variety without changing the event engine architecture or expanding gameplay systems.

The guards run as a thin filter over normal condition-based candidates.

## Guard Pipeline

`candidateEvents -> phaseGuard -> repeatGuard -> frustrationGuard -> final selection`

If all candidates are filtered, resolver falls back to the original candidate list to avoid deadlock.

## Phase Guard Rules

- Uses `allowedPhases` from the catalog entry.
- If `allowedPhases` exists, event is valid only when current `state.phase` is included.
- If `allowedPhases` is missing, event is considered valid in all phases.

## Repeat Guard Rules

- Default repeat window is `3` events.
- A non-forced event is filtered if the same `eventId` appears in the last 3 foundation memory events.

### Repeat Guard Bypass

- Forced pending-chain follow-ups bypass this guard.
- Explicitly forced follow-up candidates bypass this guard.

## Frustration Guard Rules

- Event tone is read from catalog `tone` (`positive | neutral | negative`).
- Missing or unknown tone is treated as `neutral`.
- If the last 2 recorded events are negative, another negative candidate is filtered.

### Frustration Guard Bypass

- Forced follow-up candidates bypass this guard.
- Follow-up candidates bypass this guard.
- Candidates with `allowNegativeStreakOverride: true` bypass this guard.

## Pending-Chain Precedence

Pending-chain precedence is unchanged:

- Resolver still checks pending chains first.
- Most recent chain is still selected first.
- Forced pending follow-ups bypass the guard layer.

## Verification Script

Use:

- `node dev/verify_resolver_guards.js`

This verifies:

1. phase filtering
2. anti-repeat filtering (window 3)
3. frustration filtering on negative streaks
4. forced pending-chain bypass
5. fallback behavior when guard filtering empties candidates
