# Domain Ownership Cleanup (Focused)

## Previous duplication / ambiguity
The runtime had duplicate implementations in `app.js` and split modules (`events.js`, `storage.js`, `notifications.js`).
`wireDomainOwnership()` rebinds globals from module namespaces, but event rebinding was permissive:
- partial `window.GrowSimEvents` APIs could silently mix module + legacy app functions
- this made event behavior vulnerable to load-order/API-drift regressions

## Scope cleaned in this change
Narrow scope: **event domain ownership wiring** in `app.js`.

Adjacent clarification included:
- runtime ownership map exposed for observability (`window.__gsDomainOwnership`)

No broad architecture rewrite, no UI redesign, no gameplay rebalance.

## Chosen primary ownership
For the cleaned scope, primary ownership is now explicit:
- **Event domain logic primary source:** `events.js` (`window.GrowSimEvents`)
- `app.js` remains orchestration and requires a complete event API before delegation.

## What changed
1. `wireDomainOwnership()` now validates a required event API surface before rebinding.
   - If any required function is missing, boot fails fast with
     `GrowSimEvents API unvollständig: ...`
2. Added runtime ownership telemetry:
   - `window.__gsDomainOwnership = { events, storage, notifications }`
   - marks whether module or legacy app implementation is active per domain.
3. Added deterministic verification helper:
   - `dev/verify_domain_ownership.js`
   - checks script order, strict event API enforcement, ownership map emission, and event namespace export.

## What this reduces
- Removes silent mixed-ownership fallback in the event domain when module APIs drift.
- Makes event ownership explicit and inspectable at runtime.
- Reduces hidden ambiguity around event state machine wiring.

## What remains duplicated outside this scope
Still present (intentionally not cleaned in this patch):
- Full legacy implementations still exist in `app.js` for events/storage/notifications and UI-related flows.
- Some handlers/render helpers remain duplicated between `app.js` and split files.

## Recommended next cleanup target
Next high-leverage step (separate task):
- isolate **event sheet UI ownership** so `ui.js` is sole owner for event-sheet rendering/interaction while `app.js` orchestrates only.
