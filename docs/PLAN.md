# GrowSim-v1 Phase 1 Implementation Plan

## 1) Scope & Non-Scope (Phase 1 only)

### In Scope
- Mobile-first premium HUD implementation for 375×812 baseline with one root HUD container.
- Exactly one hero plant render in the center of the hero card.
- HUD sections required by AGENTS.md:
  - Top row (Status pill, Pro pill)
  - Hero card (2 thick rings, centered plant, subtle radial glow)
  - Info bar (Next event, Growth impulse, Simulation time)
  - Mini rings row (Water, Nutrition, Growth, Risk)
  - Exactly 3 buttons (Care, Analyze, Boost with `Ad supported · X/6 today`)
  - Locked card (`Advanced diagnosis available`)
- Bottom sheets only for secondary content:
  - Care Sheet
  - Event Sheet
  - Dashboard/Log Sheet
  - Diagnosis Sheet
- Single global state object and single central simulation tick loop.
- Deterministic growth progression using only available `/assets/plant/` files.
- Minimal event wiring (roll, activate, resolve, cooldown) through the same central tick.

### Explicitly Out of Scope
- Multi-plant support or plant switching.
- Substrate choices, genetics systems, or expanded farming mechanics.
- Advanced monetization (subscriptions, IAP, ad SDK integration).
- Any background timers/workers outside the app’s single central tick loop.
- Backend/API persistence, authentication, or cloud sync.
- New asset production (including dead plant asset creation).
- Additional HUD panels beyond those explicitly required.

## 2) Visual Target & References

- Visual target image:

![GrowSim premium visual target](/docs/premium-reference.png)

- Directive: **Do not replicate UI from image, only mood/lighting style**.
- Apply premium depth cues only (glass surfaces, soft shadows, subtle glow), while keeping required HUD structure from AGENTS.md.

## 3) Repo File Map (current + planned)

### Current repository structure
- `assets/backgrounds/`
  - `bg_dark_01.jpg`, `bg_dark_02.jpg`
- `assets/overlays/`
  - `overlay_burn.png`, `overlay_def_mg.png`, `overlay_def_n.png`, `overlay_mold_warning.png`, `overlay_pest_mites.png`, `overlay_pest_thrips.png`
- `assets/plant/`
  - `seedling_01.png`, `seedling_02.png`
  - `veg_01.png`, `veg_02.png`, `veg_03.png`, `veg_04.png`
  - `flower_01.png`, `flower_02.png`, `flower_03.png`
- `docs/`
  - `premium-reference.png`

### Planned minimal files to add
1. `index.html`
   - Responsibility: Single HUD markup and sheet containers.
   - Main sections:
     - `#app-hud` root
     - top row, hero card, info bar, mini rings row, action buttons, locked card
     - bottom sheet containers: care/event/dashboard/diagnosis

2. `styles.css`
   - Responsibility: Mobile-first layout and premium visual styling.
   - Main sections:
     - viewport-safe container sizing (`100dvh`)
     - hero ring visuals (14–16px stroke look, round caps where applicable)
     - plant and overlay centering layers
     - bottom sheet positioning and internal scroll behavior

3. `app.js`
   - Responsibility: Single global state, single timer loop, growth/event logic, UI binding.
   - Main sections:
     - `state` object declaration
     - constants (tick interval, growth stages, event cooldowns)
     - `tick()` central loop
     - growth progression functions
     - event state machine functions
     - render/update functions for HUD + sheets

> Keep Phase 1 implementation inside these 3 files; no framework structure and no extra runtime modules.

## 4) Data Model (single global state)

Use exactly one global `state` object:

```js
const state = {
  sim: {
    nowMs: Date.now(),
    tickCount: 0,
    mode: 'test', // 'test' | 'prod'
    tickIntervalMs: 30000
  },

  growth: {
    phase: 'seedling', // 'seedling' | 'vegetative' | 'flowering' | 'dead'
    stageIndex: 0,
    stageName: 'seedling_01.png',
    stageProgress: 0, // 0..1
    ticksInStage: 0,
    lastValidStageName: 'seedling_01.png'
  },

  status: {
    health: 85,    // 0..100
    stress: 15,    // 0..100
    water: 70,     // 0..100
    nutrition: 65, // 0..100
    growth: 10,    // 0..100 (UI metric)
    risk: 20       // 0..100
  },

  boost: {
    boostUsedToday: 0,
    boostMaxPerDay: 6,
    dayStamp: 'YYYY-MM-DD'
  },

  event: {
    machineState: 'idle', // 'idle' | 'activeEvent' | 'resolved' | 'cooldown'
    activeEventId: null,
    activeEventTitle: '',
    activeEventText: '',
    activeOptions: [],
    lastEventAtMs: 0,
    cooldownUntilMs: 0
  },

  ui: {
    openSheet: null, // 'care' | 'event' | 'dashboard' | 'diagnosis' | null
    selectedBackground: 'bg_dark_01.jpg',
    visibleOverlayIds: []
  }
};
```

Rules:
- Single source of truth: all UI reads from `state`.
- No additional global mutable stores.
- Clamp status values to `0..100` after every mutation.

## 5) Central Timer Loop (single tick)

- Tick intervals:
  - Test mode: `30_000` to `60_000` ms.
  - Production mode: `600_000` ms (10 min).
- Create exactly one scheduler entrypoint:
  - `setInterval(tick, state.sim.tickIntervalMs)` initialized once.
- Per tick update order:
  1. Advance `state.sim.nowMs`, increment `tickCount`.
  2. Apply deterministic status drift (water/nutrition decay, stress/health/risk adjustment).
  3. Apply growth progress increment and stage transition checks.
  4. Run event machine checks (roll when idle, enforce cooldown timing).
  5. Run daily boost reset check (`dayStamp` rollover).
  6. Recompute derived UI values and render.

**No other setInterval/setTimeout loops allowed besides the central tick.**

## 6) Growth System Plan (asset-locked)

Allowed stage chains only:
- Seedling: `seedling_01.png -> seedling_02.png`
- Vegetative: `veg_01.png -> veg_02.png -> veg_03.png -> veg_04.png`
- Flowering: `flower_01.png -> flower_02.png -> flower_03.png`

Deterministic progression:
- Define fixed `ticksPerStage` values per phase/stage (e.g., seedling shorter than flowering).
- Each tick:
  - `ticksInStage += 1`
  - `stageProgress = ticksInStage / ticksPerStage` (clamped 0..1)
- When `stageProgress >= 1`:
  - move to next stage in same phase, reset `ticksInStage` and `stageProgress`
  - if final stage in phase, transition to first stage of next phase
- Flowering final stage behavior:
  - remain at `flower_03.png` unless dead transition rule is triggered.

Dead phase handling (no dead asset file):
- `growth.phase` supports `'dead'` terminal state.
- On transition to dead:
  - keep `growth.stageName = growth.lastValidStageName` if `/assets/plant/dead_01.png` is missing.
- Dead is terminal:
  - no further growth stage transitions.

## 7) Event System Plan (Phase 1 minimal)

Event timing:
- Event roll check frequency: every central tick.
- Test timing profile:
  - tick: 30–60s
  - cooldown: 60s
- Production timing profile:
  - tick: 10min
  - cooldown: 20min

State machine:
- `idle -> activeEvent -> resolved -> cooldown -> idle`

Wiring behavior:
- In `idle`, if not in cooldown and roll passes deterministic threshold, select next event from predefined list.
- `activeEvent` opens Event Sheet with title, text, 3 options.
- Option select applies status effects immediately and sets `machineState = 'resolved'`.
- In same tick cycle, resolved transitions to `cooldown` with `cooldownUntilMs`.
- When `nowMs >= cooldownUntilMs`, return to `idle`.

Phase 1 event content:
- Assume event definitions/placeholders exist in local constants.
- Focus implementation on:
  - state transitions
  - sheet display
  - effect application

## 8) UI Integration Plan (no redesign beyond scope)

HUD composition:
- Keep only AGENTS.md-required sections visible in main HUD.
- Route all non-core detail content to bottom sheets with internal scroll.

Hero plant rendering:
- Use one `<img>` element for plant sprite.
- Source path: `/assets/plant/${state.growth.stageName}`.
- No duplicate plant element and no phase-based scaling differences.
- Keep identical center alignment across all stages.

Overlays:
- Render overlays as independent `<img>` layers in the same hero stack.
- Align overlays to plant center using shared wrapper coordinates.
- Do not render hard-edged rectangle indicators.

Background:
- Use `bg_dark_01.jpg` or `bg_dark_02.jpg` from `/assets/backgrounds/`.
- Keep contrast compatible with ring readability.

## 9) Task Breakdown (checklist)

1. **Create base app shell (HTML/CSS/JS wiring)**
   - Files touched: `index.html`, `styles.css`, `app.js`
   - Acceptance criteria:
     - single HUD root exists
     - required HUD sections + 4 bottom sheets exist
     - no framework/runtime dependencies
   - Done when:
     - page loads with no console errors
     - all required sections are present in DOM

2. **Implement single global state object and constants**
   - Files touched: `app.js`
   - Acceptance criteria:
     - one exported/declared global `state`
     - growth/status/boost/event/ui structures match plan
   - Done when:
     - state can drive all visible text/rings/plant source from one object

3. **Implement central tick loop**
   - Files touched: `app.js`
   - Acceptance criteria:
     - one interval scheduler initializes once
     - tick executes ordered updates (drift, growth, events, cooldown, render)
   - Done when:
     - tick counter increments predictably
     - no additional `setInterval`/`setTimeout` loops for simulation logic

4. **Implement deterministic growth progression with asset lock**
   - Files touched: `app.js`
   - Acceptance criteria:
     - stage order exactly follows 2+4+3 images
     - no random jumps
     - dead phase supported with fallback to last valid image
   - Done when:
     - stage transitions occur in deterministic sequence
     - dead phase halts progression and keeps valid visual asset

5. **Implement minimal Phase 1 event state machine + sheet wiring**
   - Files touched: `app.js`, `index.html`
   - Acceptance criteria:
     - machine states: idle/activeEvent/resolved/cooldown
     - Event Sheet shows title/text/3 options
     - option applies effects + enters cooldown
   - Done when:
     - events trigger via central tick only
     - cooldown blocks immediate re-trigger

6. **Bind HUD UI to state values (rings, pills, info, boost counter)**
   - Files touched: `app.js`, `styles.css`, `index.html`
   - Acceptance criteria:
     - health/stress thick rings render
     - mini rings reflect water/nutrition/growth/risk
     - boost button text shows `Ad supported · X/6 today`
   - Done when:
     - all HUD metrics update from state mutations without reload

7. **Implement hero plant + overlay layer rendering**
   - Files touched: `index.html`, `styles.css`, `app.js`
   - Acceptance criteria:
     - exactly one plant image rendered from `/assets/plant/`
     - overlay images are separate centered layers
     - no phase-based plant scaling differences
   - Done when:
     - all stages remain center-aligned
     - no duplicate plant DOM nodes appear

8. **Finalize mobile fit + sheet behavior**
   - Files touched: `styles.css`, `index.html`
   - Acceptance criteria:
     - HUD fits ~100dvh on 375×812 baseline
     - primary HUD is minimally scrollable (target <= ~25% overflow)
     - sheet content scrolls internally where required
   - Done when:
     - mobile viewport check passes with no major clipping
     - dashboard/diagnosis sheets scroll internally

9. **Documentation alignment**
   - Files touched: `docs/PLAN.md`, `README.md`
   - Acceptance criteria:
     - `docs/PLAN.md` references premium image target
     - `README.md` embeds `/docs/premium-reference.png`
   - Done when:
     - both documents include the visual target reference and remain consistent

## 10) Definition of Done (PASS)

### Visual
- Premium depth is visible (glass + shadow + glow).
- Health/Stress rings are thick premium style (14–16px equivalent stroke appearance, track + progress, round caps).
- Cannabis plant is clearly recognizable and centered identically across stages.

### UX
- HUD fits approximately `100dvh` on mobile baseline.
- Main HUD remains minimal/no heavy scroll.
- Secondary content is confined to bottom sheets.

### Functional
- Single central tick loop runs simulation updates.
- Growth transitions correctly across all 9 plant images in deterministic order.
- Event flow triggers, resolves, and cools down through state machine.
- Actions update state and Boost counter displays `X/6 today`.
- No console errors.

### Test Plan (manual, mobile viewport)
1. Open app in responsive mode at `375×812` (Safari-equivalent).
2. Verify only required HUD blocks are visible in main screen.
3. Confirm plant image path resolves from `/assets/plant/<stageName>` and remains centered while stages change.
4. Run in test tick mode (30–60s); observe status drift and growth progress update each tick.
5. Observe stage progression sequence: seedling -> vegetative -> flowering without jumps.
6. Trigger/observe an event; choose an option; verify effects applied and cooldown enforced.
7. Open each bottom sheet and verify internal scrolling for dashboard/diagnosis only.
8. Verify Boost text reflects `Ad supported · X/6 today` and caps at 6.
9. Force dead-phase transition in state and confirm fallback keeps last valid plant image.
10. Confirm browser console is free of runtime errors.
