# GrowSim-v1 Deep Repository Audit

## A) Executive summary

This repository is currently in a **hybrid architecture** state: it ships both split domain files (`sim.js`, `events.js`, `ui.js`, `storage.js`, `notifications.js`) and one large monolith (`app.js`) that re-implements most of the same logic. The app boots and runs, but this creates high long-term risk (drift, regressions, and difficult debugging).

The most important runtime issues found are:
1. **Critical notification spam risk**: critical notifications can be sent every tick while critical state persists.
2. **Offline/PWA incompleteness**: service worker pre-cache does not include key runtime assets/data (`data/actions.json`, `data/events.v2.json`, most plant/overlay images), so offline behavior is partial and can break UX.
3. **Unnecessary per-tick heavy rendering**: analysis panel is force-rendered every tick, even when not open.

---

## B) Critical bugs

### CRITICAL BUGS

#### 1) Critical push notifications can spam every tick
- **File**: `notifications.js`
- **Location**: `notifyCriticalState(nowMs)`
- **Problem**: Function writes `lastCriticalAtRealMs` but never checks cooldown before sending. Because `evaluateNotificationTriggers()` runs during simulation ticks, a critical condition can trigger repeated notifications.
- **Expected behavior**: Send at most one critical notification within a cooldown window (e.g., 30–120 min).
- **Proposed fix**:
  - Add cooldown gate in `notifyCriticalState`:
    - `if ((nowMs - notifications.runtime.lastCriticalAtRealMs) < CRITICAL_COOLDOWN_MS) return;`
  - Keep `lastCriticalAtRealMs` write only when notification is actually sent.

### HIGH PRIORITY

#### 2) Dual runtime implementation (modular + monolith) creates logic drift and hidden overrides
- **Files**: `index.html`, `app.js`, `sim.js`, `events.js`, `ui.js`, `storage.js`, `notifications.js`
- **Location**: script loading and duplicate implementations
- **Problem**: `index.html` loads all split files **and** `app.js`. `app.js` contains re-implementations of many functions already present in split files, while still relying on selected globals from those files (`cacheUi`, `bindUi`, `ensureRequiredUi`). This makes runtime ownership unclear.
- **Expected behavior**: One canonical runtime path (either modular or monolith), not both.
- **Proposed fix**:
  - Short term: define explicit ownership boundaries and remove duplicate implementations from one side.
  - Mid term: convert to ES modules and import explicit dependencies.

#### 3) Offline mode misses core runtime data and assets
- **File**: `sw.js`
- **Location**: `APP_SHELL_FILES`
- **Problem**: pre-cache includes `data/events.json` but omits `data/events.v2.json`, `data/actions.json`, and most plant/overlay assets. App fetches those at boot/runtime.
- **Expected behavior**: full offline shell and deterministic offline startup with all required local assets.
- **Proposed fix**:
  - Include both event catalogs and action catalog in pre-cache.
  - Pre-cache all stage images and overlay images used by UI.
  - Consider build-time generated asset manifest to avoid manual drift.

### MEDIUM PRIORITY

#### 4) Analysis panel is force-rendered every tick
- **File**: `app.js`
- **Location**: `renderAll()` calls `renderAnalysisPanel(true)`
- **Problem**: forced rendering bypasses visibility guard and rebuilds analysis DOM every tick, even when dashboard is closed.
- **Expected behavior**: expensive panel rendering only when panel/tab is visible or data changes meaningfully.
- **Proposed fix**:
  - Call `renderAnalysisPanel(false)` from main loop.
  - Trigger full refresh only on dashboard open, tab switch, and relevant state transitions.

#### 5) Absolute icon paths reduce portability for non-root hosting
- **File**: `notifications.js`
- **Location**: `notify()` and `notifyPlantNeedsCare()` options
- **Problem**: uses `/icons/icon-192.png` absolute path; app otherwise computes base path dynamically.
- **Expected behavior**: all runtime asset URLs should respect app base path/scope.
- **Proposed fix**:
  - Replace absolute icon paths with `appPath('icons/icon-192.png')`.

---

## C) Architecture issues

## PROJECT STRUCTURE
- Front-end shell: `index.html`, `styles.css`
- Runtime logic: `app.js` + split files (`sim.js`, `events.js`, `ui.js`, `storage.js`, `notifications.js`)
- PWA: `manifest.webmanifest`, `sw.js`
- Data catalogs: `data/events.json`, `data/events.v2.json`, `data/actions.json`
- Test/dev support: `test/event-runner.js`, `dev/balance_harness.js`

## Main entry files
- HTML entry: `index.html`
- JS boot entry: `app.js` (`DOMContentLoaded -> boot()`)

## Main runtime flow
1. Browser loads deferred scripts from `index.html`.
2. `app.js` waits for `DOMContentLoaded` and calls `boot()`.
3. Boot caches required UI refs, validates UI, loads storage/catalogs, binds handlers, registers SW.
4. Tick loop starts (`setInterval(tick, tickIntervalMs)`).
5. Tick updates simulation/event state and renders HUD/sheets/panels.

## BOOT / INITIALIZATION ANALYSIS
- `cacheUi()` + `ensureRequiredUi()` provide strong startup checks and prevent silent null-deref boot failures.
- UI IDs referenced by `ui.js` are present in `index.html` (except dynamic IDs that are created at runtime banners).
- Start-run button (`#startRunBtn`) calls `onStartRun()` and hides landing when setup exists.
- Tick loop starts during boot, not after start-run; this is acceptable because `onStartRun()` re-anchors simulation timing.

## ARCHITECTURE WEAKNESSES
1. **Overgrown monolith**: `app.js` is very large and spans multiple concerns (sim, UI, events, storage, notifications, PWA).
2. **Mixed ownership model**: monolith and split files both define related behavior.
3. **Implicit global coupling**: non-module script globals and cross-file function dependency make static reasoning and testing harder.

## SCALABILITY RISKS
- Feature additions will likely duplicate across two implementations.
- Regression risk grows with every change due to unclear source-of-truth.
- Team onboarding/debugging cost is high due to indirection (`wireDomainOwnership` + global reassignment).

## REFACTOR SUGGESTIONS
1. Decide one canonical architecture: modular ES module graph preferred.
2. Split `app.js` by domain and explicitly import/export.
3. Introduce small state store API (read/update/subscribe) to reduce direct global mutation.
4. Add contract tests around boot sequence and tick invariants.

---

## D) Performance issues

## PERFORMANCE RISKS
1. Re-rendering analysis panel every tick (DOM-heavy).
2. Frequent full render path (`renderAll`) can scale poorly as UI grows.
3. String/HTML rebuilding in analysis/timeline can become expensive with larger logs.

## OPTIMIZATION OPPORTUNITIES
- Only render active sheet/panel.
- Add dirty flags for status groups (HUD vs sheets vs analysis).
- Virtualize/prune timeline rendering for long histories.

---

## E) PWA issues

## PWA ISSUES
1. Incomplete app-shell precache (missing runtime catalogs/assets).
2. Versioning exists (`CACHE_VERSION`) but manual asset list is drift-prone.
3. SW strategy for dynamic data is inconsistent (`events.json` network-first, others not explicitly handled).

## OFFLINE RISKS
- App may start but with missing action/event catalogs or missing plant visuals when offline.
- Inconsistent offline behavior between first load and subsequent loads.

---

## F) Quick wins

1. Add critical notification cooldown guard (very high impact, tiny change).
2. Stop forced analysis rendering each tick.
3. Extend pre-cache to include required catalogs + all currently referenced image assets.
4. Normalize notification icon URLs via `appPath`.
5. Remove duplicated keys in `ensureRequiredUi` list for cleanliness.

---

## G) Priority roadmap

### P1 — Critical fixes
1. Add critical notification cooldown.
2. Complete SW pre-cache for startup-critical resources.
3. Decide and document canonical runtime ownership (monolith vs split modules).

### P2 — Stability improvements
1. Add boot smoke tests (UI ID checks + start-run flow + first 3 ticks).
2. Add offline smoke tests (cold offline boot after one online install).
3. Add regression tests for event/action catalog availability.

### P3 — Architecture improvements
1. Migrate to explicit ES modules.
2. Extract state access/update layer.
3. Reduce global mutable surface.

### P4 — Performance optimizations
1. Remove unnecessary forced panel renders.
2. Add render dirty-checks by UI region.
3. Optimize timeline rendering for larger histories.

---

## Optional blocking bug note
No single hard blocker was found that always prevents startup in a normal browser environment. The app can boot and start runs. The highest practical runtime blocker class is **notification spam** and **offline incompleteness**, which can severely degrade UX/reliability.
