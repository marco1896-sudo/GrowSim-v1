# Event-Sheet Ownership Cleanup (Focused)

## Previous ownership split
Event-sheet behavior existed in both `ui.js` and `app.js`:
- both files defined `renderEventSheet`
- both files defined event-related sheet open/close handlers (`openSheet`, `closeSheet`, `dismissActiveEvent`)
- event flow (`events.js`) mutated `state.ui.openSheet`, while effective runtime behavior depended on which global function implementation won.

Because `app.js` loads last, duplicate global function names could silently override `ui.js` behavior unless explicitly rebound.

## Scope cleaned
Narrow scope only: **event-sheet UI ownership boundary**.

No broad UI redesign, no gameplay rebalance, no full sheet-system rewrite.

## Chosen ownership model
- **Primary owner for event-sheet UI behavior:** `ui.js`
- `app.js` remains orchestration and wiring.

In this scope, `app.js` now delegates event-sheet UI functions through `window.GrowSimUI` and validates the required API surface before rebinding.

## What changed
1. Added `window.GrowSimUI` export in `ui.js` for event-sheet behavior:
   - `renderEventSheet`
   - `closeSheet`
   - `dismissActiveEvent`
   - `openSheet`
2. Hardened `wireDomainOwnership()` in `app.js`:
   - requires complete `GrowSimUI` event-sheet API
   - throws clear error (`GrowSimUI API unvollständig: ...`) if incomplete
   - rebinds event-sheet functions to `ui.js` exports
3. Extended runtime ownership telemetry:
   - `window.__gsDomainOwnership.eventSheetUi = 'ui_module'` when delegated.
4. Added focused verification helper:
   - `dev/verify_event_sheet_ownership.js`

## What ui.js now owns (cleaned scope)
- Event-sheet rendering content and option button UI binding.
- Event-sheet specific close behavior (including active-event dismiss handling).
- Event-sheet open flow via `openSheet('event')` path.

## What app.js still orchestrates
- High-level boot/runtime wiring.
- Domain module ownership rebinding and validation.
- Tick/event orchestration calls (`runEventStateMachine`, `renderAll`, etc.).

## Remaining outside-scope duplication
- Legacy duplicate function bodies still exist in `app.js` for several UI/event helpers.
- `events.js` still directly mutates `state.ui.openSheet` as part of state machine transitions.

## Recommended next target
- Introduce a small dedicated UI intent boundary for event sheet visibility (e.g., UI transition helper invoked by orchestrator), reducing direct `state.ui.openSheet` mutation from domain logic.
