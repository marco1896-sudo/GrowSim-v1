# Event Resolver Guards (Foundation Layer Upgrade)

## Before this change

The foundation resolver used only direct priority checks:

1. `root_stress_pending` -> `root_stress_followup`
2. high water -> `drooping_leaves_warning`
3. stable condition -> `stable_growth_reward`
4. else `null`

It did not independently validate event phase, did not reduce immediate repeats, and had no first-pass frustration softening.

## What was added

## 1) Phase-aware validation

Resolver candidates are now checked against catalog metadata (`allowedPhases`) using the normalized plant `phase` field.

- If a candidate is phase-invalid, resolver returns `eventId: null` with `reason: phase_blocked:<id>`.
- This is done in the resolver guard layer before activation.

## 2) Anti-repeat guard

Resolver now checks recent event memory and blocks immediate duplicate selection for non-follow-up events.

- Uses `memory.getLastEvents(1)`.
- If candidate is same as the most recent event, candidate is blocked with `reason: anti_repeat_blocked:<id>`.
- Explicit follow-up events (`isFollowUp`) are exempt so causal chains still work.

## 3) Anti-frustration guardrail

Resolver now applies a narrow pressure check:

- Reads recent analysis tones (`warning`/`negative`) when available.
- If recent negative pressure is high and conditions are stable, negative candidates are softened to `stable_growth_reward` (if phase-valid).
- Explicit follow-up events remain preserved and are not softened away.

This provides first-pass “not just punishment” behavior without a broad rebalance system.

## Metadata adjustments

Tiny foundation catalog was extended with minimal metadata only:

- `tone`
- `isFollowUp`

No new event pack was introduced.

## What is intentionally left out

- complex weighted resolver scoring
- global balancing tables
- long-window pacing heuristics
- phase-specific narrative trees
- large content expansion

## Recommended next step

Add a compact **cooldown-aware preference layer** (per-tone/per-category mini cooldowns informed by memory + analysis) so event pacing gets smoother while remaining deterministic and easy to tune.
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

## Resolver Guard Pipeline

Runtime execution order for non-forced candidates is:

`candidateEvents -> phaseGuard -> repeatGuard -> frustrationGuard -> selection`

### Execution integration points

- Resolver guard filtering is executed in `src/events/eventResolver.js` (`applyGuardPipeline` inside `resolveNextEvent`).
- Runtime activation calls resolver integration before deterministic pick in:
  - `events.js` (`resolveFoundationCandidateEvent` + `activateEvent`)
  - `app.js` legacy runtime path (`resolveFoundationCandidateEvent` + `activateEvent`)

### Bypass rules

- Pending-chain follow-ups bypass guards via resolver pending-chain precedence (`followUpForced: true`).
- `root_stress_pending` flag follow-up override also remains forced and bypasses guards.
- Follow-up candidates (`isFollowUp: true`) bypass repeat/frustration filtering as implemented in guard logic.

### Fallback rules

- If guard filtering removes all candidates, resolver falls back to the original candidate list for that tick.
- This avoids no-event deadlocks while still applying guard filtering whenever at least one guarded candidate remains.

### Pending-chain interaction

- Pending-chain precedence remains unchanged: pending chain selection happens before normal candidate generation.
- Consumed pending chains are removed during activation after the selected event is applied.
- Follow-up tokens continue to set/clear foundation flags and chains, preserving causal chain behavior.
