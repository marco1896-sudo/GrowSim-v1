Hier ist deine **finale, copy/paste-fertige AGENTS.md**, exakt passend zu deinem aktuellen Repo-Stand (9 vorhandene Pflanzenbilder, kein Dead-Asset).

---

# AGENTS.md — GrowSim Premium (Current Asset Scope)

## Prime Directive

Build a premium mobile HUD interface matching the provided reference image.
The HUD must NOT be scroll-heavy.
If vertical scroll exceeds ~25% of viewport height, it is a failure.

---

## Non-Negotiables

* Mobile-first: iPhone Safari baseline (375×812)
* No frameworks
* No external libraries
* No console errors
* One single HUD root container
* Exactly ONE hero plant (no duplicates)
* All secondary content goes into bottom sheets (internal scroll only)
* Single simulation tick loop
* Single global state object
* Plant image must always load from `/assets/plant/`

---

## HUD MUST CONTAIN ONLY

### Top Row

* Status pill (left)
* Pro pill (right)

### Hero Card

* 2 thick rings (Health / Stress)
* Cannabis plant centered
* Subtle radial glow behind plant
* No duplicate plant render
* No dynamic scaling per phase

### Info Bar

* Next event
* Growth impulse
* Simulation time pill

### Mini Rings Row

* Water
* Nutrition
* Growth
* Risk

### Buttons (exactly 3)

* Care
* Analyze
* Boost
  Text: “Ad supported · X/6 today”

### Locked Card

* Advanced diagnosis available

---

## HUD MUST NOT CONTAIN

* Log list
* Export JSON
* Long diagnosis text
* Debug panels
* Dev counters

All of the above must live inside sheets only.

---

# REQUIRED BOTTOM SHEETS

### Care Sheet

Water
Feed
Prune
Dashboard
Emergency
Close

### Event Sheet

Title
Text
3 options

### Dashboard / Log Sheet

Log list
Export
Close
Internal scroll only

### Diagnosis Sheet

Details
CTA
Close
Internal scroll only

---

# GROWTH SYSTEM (STRICT ASSET LOCK)

Use ONLY these existing plant images:

```
/assets/plant/
```

## Phase 1 — Seedling

* seedling_01.png
* seedling_02.png

Progression:
seedling_01 → seedling_02

---

## Phase 2 — Vegetative

* veg_01.png
* veg_02.png
* veg_03.png
* veg_04.png

Progression:
veg_01 → veg_02 → veg_03 → veg_04

---

## Phase 3 — Flowering

* flower_01.png
* flower_02.png
* flower_03.png

Progression:
flower_01 → flower_02 → flower_03

---

## Dead State

Dead phase must exist in logic
BUT no dead asset is currently available.

System must:

* Support phase: "dead"
* Keep last valid plant image if dead_01.png does not exist

---

# REQUIRED STATE STRUCTURE

State must include:

```
phase: "seedling" | "vegetative" | "flowering" | "dead"
stageIndex: number
stageName: string
stageProgress: number (0–1)
ticksInStage: number
```

Rules:

* StageProgress fills 0 → 1
* When full → next stage
* When last stage of phase completes → next phase
* Dead is terminal
* No random growth jumps
* No visual scaling differences between phases
* Same center alignment for all stages

---

# Documentation Requirement

Reference image is stored at:

```
/docs/premium-reference.png
```

Must be:

* Embedded in README.md (image preview)
* Referenced in docs/PLAN.md as visual target

---

# Definition of Done (PASS)

## Visual

* Premium depth clearly visible (glass + shadow + glow)
* Thick premium rings:

  * 14–16px stroke
  * Track + progress
  * Round caps
* Cannabis plant unmistakably recognizable
* Identical centering across all stages

## UX

* HUD fits ~100dvh
* Minimal / no scroll
* All secondary content in sheets

## Functional

* Single tick loop runs
* Growth transitions work across all 9 plant images
* Events trigger & resolve
* Actions work
* Boost counter shows X/6 today
* No console errors

deterministisch).

