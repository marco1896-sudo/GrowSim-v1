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
