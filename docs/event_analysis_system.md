# Event Outcome Analysis System (Foundation Layer 2)

## Storage location

Outcome analysis entries are stored inside the existing event foundation state:

- `state.events.foundation.analysis` (append-only bounded list)

This avoids creating a parallel truth and keeps persistence aligned with existing canonical event state.

## Analysis entry model

Each entry contains:

- `analysisId`
- `eventId`
- `optionId`
- `atRealTimeMs`
- `atSimTimeMs`
- `tick`
- `tone` (`positive`, `negative`, `neutral`, `warning`, `recovery`)
- `actionText`
- `causeText`
- `resultText`
- `guidanceText`
- `relatedFlags`
- `relatedChainId` (optional)
- compact `normalizedState` snapshot

## Generation strategy

`src/events/eventAnalysis.js` implements a template-based generator:

- `generateOutcomeAnalysis(context)`
- `generateAndStoreAnalysis(eventsState, context)`
- `getLatestAnalysis(eventsState)`

Current coverage is intentionally narrow and explicit for the 3 foundation demo events/options:

- `drooping_leaves_warning`
  - `reduce_watering_now`
  - `ignore_signals`
- `root_stress_followup`
  - `recover_root_zone`
- `stable_growth_reward`
  - `keep_current_plan`

Fallback wording exists for unknown pairs so the system remains extensible.

## Integration with decision flow

The decision hook remains in `events.js` `onEventOptionClick`.

After option effects/follow-ups are applied:

1. analysis is generated from eventId/optionId + normalized plant state + active flags,
2. entry is stored in `state.events.foundation.analysis`,
3. entry is attached to event history row (`history.events[]`),
4. latest foundation decision is back-linked with `analysisId`/`analysisTone`.

This keeps runtime integration narrow and avoids rewriting the event machine.

## Lightweight surfacing

No broad UI rewrite was introduced.

A minimal surfacing step was added in the existing Analysis > Timeline renderer:

- if an event history row contains `analysis`, timeline now renders short causal text (action, cause, result, next focus)

This reuses an existing player-facing surface without adding new panels.

## What is still missing before full rollout

- localization/content pass beyond demo templates
- phase-specific narrative variants
- anti-repeat narrative selection
- richer chain-aware summaries across multiple events
- dedicated UI styling for tone categories

## Recommended next implementation step

Add a small **analysis selector layer** that picks between multiple tone/phase variants per event-option using recent analysis memory, so repeated events stay readable without feeling repetitive.
