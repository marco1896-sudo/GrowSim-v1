# Iteration 3 Plan — Canonical State Consolidation + app.js Modularization

Mode: Planning/Documentation only (no runtime changes in this step)

References:
- `data/STATE_SCHEMA.md.txt`
- `data/EVENT_SCHEMA.md`
- `agents/ROADMAP_NEXT_3_ITERATIONS.md.txt`
- current `app.js`

---

## 1) Canonical-only consolidation plan

## 1.1 Legacy namespaces currently present

### A) `state.sim` (legacy runtime timing)
- **Canonical replacement:** `state.simulation`
- **Current readers/writers (examples):**
  - Tick/time: `tick`, `syncRuntimeClocks`, `resetBoostDaily`, `schedulePushIfAllowed`
  - Rendering: `renderHud`, event countdown display
  - Determinism context: `deterministicUnitFloat` inputs
  - Integrity/init: `ensureStateIntegrity`, `resetStateToDefaults`
  - Canonical mirror: `syncCanonicalStateShape`
- **Migration order:**
  1. Introduce `simulation` access helpers and route all reads through canonical first.
  2. Move writers in tick loop to `state.simulation` only.
  3. Keep `state.sim` as read-only compatibility mirror (derived from canonical).
  4. Remove direct reads of `state.sim` from UI/engine.
- **Final removal criteria:**
  - no functional code paths reading or writing `state.sim` directly
  - only migration adapter references remain

### B) `state.growth` (legacy plant lifecycle)
- **Canonical replacement:** `state.plant`
- **Current readers/writers (examples):**
  - Stage progression: `advanceGrowthTick`, `setGrowthStageIndex`, `computeGrowthPercent`
  - Quality tiers: `updateQualityTier`
  - Render path: stage image/status text
  - Trigger fields: event evaluator (`plant.stageIndex`, `plant.stageKey` currently mapped from growth)
- **Migration order:**
  1. Define canonical `plant.lifecycle` + `plant.stage*` write model as authoritative.
  2. Move stage/quality writers from `growth.*` to `plant.*`.
  3. Provide compatibility derivation into `growth.*` (temporary).
  4. Remove `growth.*` direct reads across engine/UI.
- **Final removal criteria:**
  - stage/quality decisions read/write canonical `plant` only
  - no direct `state.growth` reads in rendering or logic

### C) `state.event` (legacy event machine)
- **Canonical replacement:** `state.events`
- **Current readers/writers (examples):**
  - Scheduler/machine: `runEventStateMachine`, `enterEventCooldown`, `scheduleNextEventRoll`
  - Active event view: `renderEventSheet`, `onEventOptionClick`
  - Catalog: `loadEventCatalog`, `syncActiveEventFromCatalog`
- **Migration order:**
  1. Move scheduler fields (`next`, `last`, cooldowns, active) to `state.events.scheduler`/`state.events.active`.
  2. Update state machine to operate canonically.
  3. Keep `state.event` as compatibility mirror populated from canonical.
  4. Remove direct `state.event` references.
- **Final removal criteria:**
  - event machine reads/writes only `state.events.*`
  - UI event sheet bound to canonical active event data

### D) `state.historyLog` (legacy mixed log)
- **Canonical replacement:** `state.history` (`actions/events/system`)
- **Current readers/writers (examples):**
  - `addLog` still writes `historyLog`
  - historical dashboard signatures/items still tied to `historyLog`
  - canonical history also written in parallel for actions/events
- **Migration order:**
  1. Replace log rendering sources with canonical slices only.
  2. Keep debug/internal mirror optional (or remove entirely).
  3. Normalize log entry shapes by domain (`actions/events/system`).
- **Final removal criteria:**
  - no UI reads from `historyLog`
  - no required engine writes to `historyLog`

### E) Legacy cross-links
- `state.lastEventId`, `state.lastChoiceId` (flat legacy convenience fields)
- **Canonical replacement:** `state.events.scheduler.lastEventId` + latest event history entries
- **Removal criteria:**
  - consumers switched to canonical scheduler/history access

---

## 2) Single source of truth contract

Effective after Iteration 3 refactor:

## 2.1 Canonical fields that drive runtime decisions
- **Simulation timing:** `state.simulation`
  - `simTimeMs`, `simDay`, `simHour`, `simMinute`, `isDaytime`, `timeCompression`
- **Plant lifecycle:** `state.plant`
  - `stageIndex`, `stageKey`, `lifecycle.qualityTier`, `lifecycle.totalSimDays`
- **Event scheduling:** `state.events.scheduler`
  - `nextEventRealTimeMs`, `lastEventRealTimeMs`, `lastEventId`, `lastEventCategory`, `eventCooldowns`
- **Active event:** `state.events.active`
  - current event metadata/options context
- **History:** `state.history`
  - `actions[]`, `events[]`, `system[]`

## 2.2 Forbidden writes (future rule)
After canonical cutover, forbid direct writes to:
- `state.sim.*`
- `state.growth.*`
- `state.event.*`
- `state.historyLog`
- flat `state.lastEventId` / `state.lastChoiceId`

Allowed only in migration adapter (read-old/write-canonical once during load).

---

## 3) app.js modularization design (target layout)

Proposed structure (Vanilla ES modules, no bundler):

```text
/engine/
  boot.js               # boot pipeline orchestration
  state.js              # defaults, migration, integrity, canonical adapters
  persist.js            # IndexedDB/localStorage adapter + throttled persistence
  sim.js                # tick loop, time progression, day/night
  stages.js             # stage progression + quality gating
  actions.js            # applyAction, cooldowns, overtime effects
  events.js             # catalog load/normalize, triggers, scheduler, option apply
  deterministic.js      # hash/PRNG helpers + deterministic selection utils

/ui/
  cache.js              # cacheUi + required element checks
  sheets.js             # open/close/toggle sheet plumbing
  hud.js                # HUD render only
  care.js               # care modal rendering + tab/category interactions
  analysis.js           # overview/diagnosis/timeline rendering
  event-sheet.js        # active event UI rendering/option buttons

/pwa/
  sw-register.js        # service worker registration helpers

/main.js                # imports boot() and starts app
```

Boundary rules:
- Engine modules must not touch DOM.
- UI modules must not mutate simulation outcomes directly.
- `state.js` is the only source of defaults/migration/shape guarantees.
- Deterministic utilities centralized in one module.

---

## 4) Minimal refactor strategy (safe sequence)

## Step 1 — Non-functional extraction (no logic changes)
- Copy existing functions into target modules with same behavior.
- Keep current `app.js` wrappers delegating to module exports.
- **Outcome:** architecture split without behavior change.

## Step 2 — Switch to module entrypoint
- Convert script to ES module loading (`type="module"`) using `/main.js`.
- Update internal imports/exports only; preserve function contracts.
- **Outcome:** runtime executes via module graph, still behavior-identical.

## Step 3 — Canonical ownership cutover
- Move decision writers/readers to canonical namespaces.
- Keep legacy compatibility adapter only at migration boundaries.
- **Outcome:** canonical source-of-truth enforced.

## Step 4 — Remove compatibility leftovers
- Remove dead legacy mirrors once no readers remain.
- Final schema-clean persistence snapshots.
- **Outcome:** simplified state model and lower regression surface.

After each step run smoke tests before proceeding.

---

## 5) Gate checks for refactor

## Gate 1 — Schema compliance
- [ ] Runtime decisions read canonical fields only (`simulation/plant/events/history`)
- [ ] Migration from legacy saves works without data loss
- [ ] Persisted snapshots match `STATE_SCHEMA.md.txt`

## Gate 2 — Determinism
- [ ] No `Math.random()` in any runtime decision path
- [ ] Event selection/side effects/actions remain seeded and reproducible
- [ ] Same seed + setup + actions => same timeline outcomes

## Gate 3 — Smoke tests (functional)
- [ ] App boots without console errors
- [ ] Plant image renders
- [ ] Simulation time advances
- [ ] Pflege modal opens and actions apply
- [ ] Event scheduler triggers daytime events, respects cooldowns
- [ ] Event option choice mutates status/history correctly
- [ ] Analysis tabs render Overview/Diagnosis/Timeline from canonical history

## Gate 4 — UX sanity
- [ ] No internal debug tick counters exposed
- [ ] Mobile sheet/timeline scroll without overflow breakage
- [ ] Empty histories show safe placeholders (no crashes)

## Gate 5 — Offline/PWA sanity
- [ ] Service worker still registers
- [ ] App shell loads offline after first visit
- [ ] Data fetch failures degrade gracefully (fallbacks/no crash)

---

## 6) Acceptance checklist for later implementation

Use this checklist for Iteration 3 implementation completion:

- [ ] Canonical ownership matrix implemented (`simulation/plant/events/history`)
- [ ] Legacy fields removed from runtime decision paths
- [ ] `app.js` responsibilities split into module boundaries above
- [ ] All gates 1–5 pass on fresh profile and reload
- [ ] Migration tested with older save payloads
- [ ] No regressions in care/event/analysis flows

---

## 7) Risks and mitigations

- **Risk:** hidden legacy reads remain after cutover.
  - **Mitigation:** grep-based enforcement + temporary runtime assertions.
- **Risk:** module conversion breaks script loading order.
  - **Mitigation:** staged wrappers + single `main.js` entry.
- **Risk:** PWA cache serves mixed old/new files.
  - **Mitigation:** cache version bump and offline sanity test on fresh install.
