# Boot Recovery and Minimal Gates

## Scope
This was a narrow stabilization pass to restore parse + boot health after integration regressions.
No gameplay/system expansion was included.

## What broke (parse/boot blockers)

### Primary blockers
1. `app.js`
   - Broken state object brace structure around `state.events.foundation.analysis` caused parser failure (`Missing initializer in const declaration`).
   - Type: malformed object syntax (edit artifact).

2. `events.js`
   - `resolveFoundationCandidateEvent()` had malformed `memoryFacade` object (`getRecentAnalysis` missing trailing comma + duplicated `getLastEvents`).
   - Resolver call object duplicated `memory` key and missed comma before it.
   - Type: malformed object syntax (merge/edit artifact).

3. `src/events/eventResolver.js`
   - Duplicate nested `resolveNextEvent` declaration inserted mid-function with missing closure boundaries.
   - Type: malformed function structure (merge/edit artifact).

### Secondary fallout
4. `dev/verify_event_foundation.js`
   - Duplicate `memory` object property in multiple resolver calls (missing comma + repeated key pattern).
   - Type: malformed object syntax (same artifact pattern).

5. `dev/verify_event_resolver_guards.js`
   - Not structurally broken itself; it failed because `src/events/eventResolver.js` could not be parsed/imported.
   - Type: cascade failure.

## What was fixed
- Corrected the `app.js` state object brace layout in the `events.foundation` block.
- Repaired `events.js` foundation candidate bridge object syntax and deduplicated keys.
- Removed duplicate malformed nested function in `src/events/eventResolver.js`, preserving the intended resolver with `catalog` integration and guard finalization behavior.
- Repaired malformed resolver call payloads in `dev/verify_event_foundation.js`.

## Boot verification performed
1. Static syntax verification:
   - `node --check` on core runtime scripts and touched foundation/dev verification scripts.
2. Runtime/browser smoke:
   - Served app locally via `python -m http.server 5173`.
   - Ran Playwright smoke and asserted:
     - no page parse errors
     - `window.__gsBootOk === true`
     - `window.__gsDomainOwnership` exists

## Minimal gates added

### 1) Core syntax gate (required)
- New file: `dev/verify_core_syntax.js`
- Runs `node --check` over core runtime + foundation + critical verification files.

Run:
```bash
node dev/verify_core_syntax.js
```

### 2) Browser boot smoke gate (required before deep integration work)
- New file: `dev/verify_boot_smoke.py`
- Checks parse/runtime boot sanity in browser (`__gsBootOk`, ownership map, no page/console errors).

Run:
```bash
python -m http.server 5173
python dev/verify_boot_smoke.py --url http://127.0.0.1:5173
```

## Intentionally not addressed in this recovery pass
- No event-system redesign.
- No chain-lifecycle redesign.
- No UI refactor.
- No gameplay balancing changes.

Those belong to follow-up work now that parse/boot health is restored.
