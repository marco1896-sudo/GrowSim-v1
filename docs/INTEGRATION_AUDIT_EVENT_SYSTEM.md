# Grow Simulator Integration Audit — Runtime & Event System

Date: 2026-03-11

## 1) Executive summary

Overall health is **critical / not runtime-ready** in the current branch state.

The largest blocker is not a subtle integration edge case but a hard boot failure chain:
- `app.js` currently contains a syntax-level object-brace break in initial state construction.
- `events.js` currently contains duplicate object keys / malformed object literals in the foundation resolver bridge.
- `src/events/eventResolver.js` currently contains a duplicated nested `resolveNextEvent` declaration with missing braces.

Because scripts are loaded as independent deferred scripts from `index.html`, these syntax failures prevent ownership wiring and boot from completing. The browser runtime never reaches the expected `window.__gsBootOk = true` flow.

This means deeper feature-level integration (follow-up chains, analysis timeline coherence, save/restore robustness under live play) cannot be considered production-valid yet, even though several subsystem-level improvements are present.

---

## 2) Current architecture snapshot

### 2.1 Script/load flow
- `index.html` loads simulation/foundation/ui/storage/events/app in this order: `sim.js`, foundation modules, `events.js`, `ui.js`, `storage.js`, `notifications.js`, `app.js`. This means failures in later scripts still allow earlier scripts to parse, but any app bootstrap in `app.js` is fatal when parse fails.  

### 2.2 Canonical runtime state (intended)
- Main canonical state root is the large `state` object in `app.js` with domains: `simulation`, `plant`, `events`, `history`, `status`, `boost`, `actions`, `ui`, `settings`, `meta`.  
- Event foundation state is nested under `state.events.foundation` with `flags`, `memory.events`, `memory.decisions`, `memory.pendingChains`, and `analysis`.  
- UI sheet lifecycle state is under `state.ui.openSheet` plus `state.ui.analysis.activeTab`, menu flags, and death overlay flags.  

### 2.3 Responsibility map (intended)
- Tick/update + offline catch-up + boost: `sim.js` (`tick`, `applySimulationDelta`, `syncSimulationFromElapsedTime`, `onBoostAction`).
- Event activation/decision/cooldown/scheduling: `events.js` (`runEventStateMachine`, `activateEvent`, `onEventOptionClick`, `enterEventCooldown`, `scheduleNextEventRoll`).
- Sheet rendering/open/close: `ui.js` (`renderAll`, `renderEventSheet`, `renderAnalysisPanel`, `openSheet`, `closeSheet`, `dismissActiveEvent`).
- Persistence/migration/canonicalization: `storage.js` (`restoreState`, `persistState`, `migrateState`, `ensureStateIntegrity`, `syncCanonicalStateShape`).
- Foundation APIs: `src/simulation/plantState.js`, `src/events/eventFlags.js`, `src/events/eventMemory.js`, `src/events/eventResolver.js`, `src/events/eventAnalysis.js`.

### 2.4 Ownership model vs effective ownership today
- Intended strict ownership handoff is in `app.js` via `wireDomainOwnership()`, rebinding event/storage/notification function pointers from namespaced modules (e.g., `window.GrowSimEvents`).
- Effective ownership is currently **ambiguous and broken** because parsing errors prevent module API publication and prevent `app.js` boot/wiring from safely executing.
- There is still full legacy duplication across `app.js` (contains old inline implementations of event/ui/storage/sim responsibilities) and separate domain files. This remains a structural collision zone even once syntax errors are fixed.

---

## 3) What is working well (subsystem-level)

Even with integration breakage, several isolated pieces show good direction:
- Storage canonicalization explicitly initializes foundation fields (`flags`, `memory.events/decisions/pendingChains`, `analysis`).
- Bounded memory / analysis capacities exist (`events` & `decisions` capped to 25; analysis capped to 40).
- Boost semantics are clearly constrained to event-time acceleration plus small plant impulse in `sim.js`.
- Offline simulation cap logic exists with an 8-hour cap and explicit user/system log note.

These are solid primitives once global parse/runtime integrity is restored.

---

## 4) Open bugs / likely failure points

## F1 — Critical: runtime boot blocked by syntax errors across core scripts
- **Symptom:** app never reaches boot-ready state, domain ownership map absent, page reports parser errors.
- **Root cause:** malformed literals / duplicated declarations.
- **Evidence:**
  - `app.js` state object has brace mismatch around `events.foundation.analysis` region.
  - `events.js` has malformed object literal (`memoryFacade` + duplicated `memory` key in resolver call).
  - `src/events/eventResolver.js` duplicates `resolveNextEvent` with missing braces.
- **Severity:** critical
- **Repro:** high
- **Confidence:** proven by static syntax check and browser runtime page errors.

## F2 — High: foundation resolver path currently non-executable
- **Symptom:** `resolveFoundationCandidateEvent()` cannot safely run with broken resolver/module parse; forced event reasoning is disabled.
- **Root cause:** `src/events/eventResolver.js` parse failure and malformed `events.js` resolver bridge code.
- **Severity:** high
- **Repro:** high
- **Confidence:** proven by `node --check` + require failure.

## F3 — High: planned domain ownership hardening currently gives false confidence
- **Symptom:** verification script for domain ownership passes while runtime is non-functional.
- **Root cause:** ownership verification validates script order and API contract intent, but does not validate parse integrity of actual runtime scripts.
- **Severity:** high (process/tooling quality risk)
- **Repro:** high
- **Confidence:** proven by command-level mismatch (ownership verifier passes; app still crashes).

## F4 — High: pending chain lifecycle is write-only (set, never consumed/cleared)
- **Symptom:** follow-up chain entries can accumulate and influence analysis relation inference without deterministic execution lifecycle.
- **Root cause:** `setPendingChain` is used from follow-ups, but there is no corresponding chain consumption path in event activation/scheduler.
- **Severity:** high
- **Repro:** high
- **Confidence:** proven by code-path inspection.

## F5 — Medium: event trigger roll threshold computed but not used in activation gate
- **Symptom:** when scheduler hits roll time, event activation path proceeds directly to `activateEvent` (subject to eligibility), bypassing probability gating semantics implied by `eventThreshold` / `shouldTriggerEvent`.
- **Root cause:** `runEventStateMachine` logs roll+threshold but does not branch via `shouldTriggerEvent(roll)`.
- **Severity:** medium
- **Repro:** high
- **Confidence:** proven by code-path inspection.

## F6 — Medium: event dismissal path bypasses foundation analysis/memory updates
- **Symptom:** dismissing active event applies penalty and resolution transition but does not generate outcome analysis nor decision-memory entry, creating timeline/analysis asymmetry vs normal option clicks.
- **Root cause:** `dismissActiveEvent()` performs penalty + state transition directly.
- **Severity:** medium
- **Repro:** high
- **Confidence:** proven by code-path inspection.

## F7 — Medium: duplication between `app.js` and domain modules remains a regression trap
- **Symptom:** same function responsibilities exist in multiple files (`runEventStateMachine`, `onEventOptionClick`, `renderAll`, persistence methods), inviting drift and shadowing.
- **Root cause:** partial extraction to domain modules without deleting legacy inline versions.
- **Severity:** medium
- **Repro:** high
- **Confidence:** proven by symbol/function duplication scan.

## F8 — Medium: verification helper itself is syntactically broken
- **Symptom:** `dev/verify_event_foundation.js` fails to parse.
- **Root cause:** duplicated `memory` object entries in resolver call literal.
- **Severity:** medium (confidence debt)
- **Repro:** high
- **Confidence:** proven by direct execution failure.

---

## 5) Integration risks by area

### A) Legacy vs new foundation collisions
- Current branch still contains parallel logic in legacy `app.js` and extracted modules.
- Ownership wiring relies on successful parse of module scripts and then `app.js`; current syntax failures invalidate that assumption.
- Risk: “hidden parallel truth” persists even after syntax fix unless ownership boundaries are mechanically enforced (CI lint + dead code deletion plan).

### B) Event flow consistency
Target path: Event → decision → analysis → follow-up
- Normal option selection path is reasonably coherent in `events.js` (`applyFoundationFollowUps` + analysis generation + history entry).
- Follow-up chain execution is incomplete (pending chains written but not consumed), leaving event chain semantics under-specified in runtime.
- Dismiss path bypasses analysis and memory decision parity.

### C) UI flow consistency
- `openSheet` / `closeSheet` mutate `state.ui.openSheet` directly and are simple.
- `closeSheet` when event active routes into `dismissActiveEvent`, which applies gameplay penalties and immediate transition; this is strong coupling of UI close action to gameplay mutation.
- Risk: unintended penalties or missing analysis when UI-driven closure occurs in edge states.

### D) Persistence / restore consistency
- Positive: canonicalization includes foundation structures and bounded lists.
- Risk: because runtime boot is broken, practical restore behavior after foundation writes could not be end-to-end validated in browser.
- Structural risk: whole-state snapshot persistence without schema-scoped pruning can preserve stale/legacy mirrors and ambiguous truth surfaces.

### E) Timing / scheduler consistency
- Live tick + offline catch-up + boost have explicit dedicated paths.
- Known seam: activation roll threshold currently not governing activation in state machine (semantic mismatch).
- Potential seam: boost advances event scheduler/cooldown timing without a dedicated reconciliation step for pending chain semantics.

---

## 6) Save/load/restore assessment

**Status:** partially strong primitives, but currently blocked from trustworthy runtime verification.

- Canonical init for foundation fields exists in `getCanonicalEvents()`.
- Restore merges saved event state and scheduler state; migration also handles legacy event shape.
- `ensureStateIntegrity()` clamps and normalizes many fields.
- But because parse failures stop app boot, real-world save→reload with foundation data is currently untrustworthy until parse/boot fixed first.

Risk ranking:
1. Boot break (critical)
2. Chain lifecycle ambiguity (high)
3. Legacy mirror drift persistence (medium)

---

## 7) Timing/scheduler assessment

- Tick loop (`sim.js`) updates sim time from elapsed real time, applies drift/action effects/growth, then runs event state machine.
- Offline resume uses capped elapsed (`MAX_OFFLINE_SIM_MS`), then calls same simulation delta path.
- Boost path intentionally nudges plant and advances event timing.
- Key inconsistency: probability threshold appears informational, not operational, at activation boundary.

---

## 8) UI flow assessment

- Sheet open/close is mostly deterministic.
- Event sheet lifecycle is controlled both by event machine (`runEventStateMachine`) and direct UI calls.
- Dismiss-close coupling currently creates gameplay mutation path that skips foundation analysis generation.

---

## 9) Top improvement proposals

### A) Immediate fixes (before any feature work)
1. **Restore parse integrity in `app.js`, `events.js`, `src/events/eventResolver.js`, `dev/verify_event_foundation.js`.**
   - Why: runtime currently non-functional.
   - Risk reduced: total boot failure.
   - Scope: narrow-to-medium.
   - Priority: P0.

2. **Add CI static syntax gate over all runtime and dev verification JS files (`node --check` sweep).**
   - Why: these errors should never survive integration.
   - Risk reduced: silent parser regressions.
   - Scope: narrow.
   - Priority: P0.

3. **Add boot sanity check test (`window.__gsBootOk === true`, ownership map present) in browser smoke.**
   - Why: catches runtime parse/wire failures quickly.
   - Risk reduced: false-positive module verification.
   - Scope: narrow.
   - Priority: P0.

### B) Structural hardening
4. **Finish ownership migration by deleting or quarantining legacy duplicate implementations in `app.js`.**
   - Why: current duplication is a persistent collision source.
   - Risk reduced: drift/parallel truth.
   - Scope: broad.
   - Priority: P1.

5. **Define explicit pending-chain lifecycle contract (create → consume → clear/expire) and enforce in resolver/event machine.**
   - Why: current write-only chains can corrupt long-term behavior.
   - Risk reduced: duplicated/lost follow-ups and stale influence.
   - Scope: medium.
   - Priority: P1.

6. **Unify event close semantics with explicit outcome type (`chosen`, `dismissed`, `timeout`) and generate analysis for all.**
   - Why: timeline/analysis consistency.
   - Risk reduced: user-visible mismatch and debugging ambiguity.
   - Scope: medium.
   - Priority: P1.

### C) Gameplay-system next steps (after stability)
7. Expand event catalog/follow-up depth only after resolver and chain lifecycle are stable.
8. Add richer analysis narratives after uniform outcome contracts are in place.
9. Introduce weighted scheduling sophistication only after activation gate semantics are clarified and tested.

---

## 10) Recommended next implementation order

1. **P0 parse + boot restoration** (all syntax blockers).  
2. **P0 automated syntax and browser boot smoke checks in validation pipeline.**  
3. **P1 pending-chain lifecycle completion and tests.**  
4. **P1 event outcome normalization (including dismiss path analysis parity).**  
5. **P1 duplicate ownership cleanup in `app.js` (remove legacy shadows).**  
6. **P2 resume/boost/offline edge-case integration tests once runtime stable.**

---

## 11) Verification performed in this audit

- Static parsing checks over runtime modules and app entrypoint.
- Existing verification helper runs (where parsable).
- Browser runtime smoke via local static server + Playwright capturing page errors and boot state.
- Targeted symbol scans for pending-chain usage and duplicate responsibility surfaces.

