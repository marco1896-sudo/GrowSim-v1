# Event Catalog Guard Metadata Check

## Scope checked
This audit validates **real runtime event catalog sources** loaded by `loadEventCatalog()` in `app.js`:

- `data/events.json` (v1)
- `data/events.foundation.json` (foundation)
- `data/events.v2.json` (v2)

The verifier was added at:

- `dev/verify_event_catalog_guard_metadata.js`

## Guard-relevant metadata validated
The check focuses on metadata used by resolver guard behavior in `src/events/eventResolver.js`:

- `tone`
  - Expected values: `positive | neutral | negative`
  - Resolver default when missing/invalid: treated as `neutral`
- `allowedPhases`
  - Canonical phase vocabulary in this repo: `seedling | vegetative | flowering | harvest`
  - Missing/empty `allowedPhases` currently behaves as **allow-all** in phase guard
- Additional metadata quality signals (non-blocking):
  - missing `category` (runtime inference/fallback)
  - follow-up shape ambiguity (`isFollowUp` without option follow-up markers)

## Current resolver defaults relevant to this audit
From current resolver/runtime behavior:

- Missing or invalid tone is normalized to `neutral` (`getEventTone`).
- Missing or empty `allowedPhases` allows all phases (`isPhaseAllowed`).
- This means metadata gaps can silently weaken:
  - frustration protection (tone-based streak checks)
  - phase filtering consistency

## Findings
Output of `node dev/verify_event_catalog_guard_metadata.js` on current repo:

- **Hard errors**
  - `data/events.foundation.json` is not valid JSON (parse failure).
- **Warnings**
  - 35 events (all parsed v1+v2 events) are missing `tone` and therefore rely on resolver default `neutral`.
- **Info**
  - 20 v1 events are missing explicit `category` and currently rely on inference/fallback.

No invalid phase tokens were found in parsed catalogs, and parsed events all had non-empty `allowedPhases` arrays.

## Localized fixes applied
No catalog content was bulk-edited in this task.

This work intentionally adds **verification only** and reports gaps without broad rewrite.

## Recommended next action
Single best next step:

1. Fix `data/events.foundation.json` JSON syntax so foundation events can be parsed and audited, then rerun `node dev/verify_event_catalog_guard_metadata.js`.

After syntax is fixed, add explicit `tone` metadata incrementally (starting with foundation events that participate in guard-critical flows).
