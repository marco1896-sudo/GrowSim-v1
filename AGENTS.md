# AGENTS.md — GrowSim Premium (Greenfield)

## Prime Directive
Build a premium mobile HUD interface matching the provided reference image.
The HUD must NOT be scroll-heavy. If vertical scroll exceeds ~25% of viewport, it is a failure.

## Non-Negotiables
- Mobile-first: iPhone Safari baseline (375×812)
- No frameworks, no external libraries
- No console errors
- One single HUD root container
- Exactly ONE hero plant (no duplicates)
- All secondary content goes into bottom sheets (internal scroll only)
- Single simulation tick loop, single state object

## HUD MUST CONTAIN ONLY
1) Top row: Status pill (left) + Pro pill (right)
2) Hero card: 2 thick rings (Health/Stress) + cannabis plant centered + radial glow
3) Info bar: Next event + growth impulse + sim time pill
4) Mini rings row: Water / Nutrition / Growth / Risk
5) 3 buttons only: Care / Analyze / Boost (“Ad supported · X/6 today”)
6) Locked card: Advanced diagnosis available

## HUD MUST NOT CONTAIN
- Log list
- Export JSON
- Long diagnosis text
- Debug panels
These must be inside sheets.

## REQUIRED BOTTOM SHEETS
- Care sheet (Water/Feed/Prune/Dashboard/Emergency/Close)
- Event sheet (title + text + 3 options)
- Dashboard/Log sheet (log list + export + close; internal scroll)
- Diagnosis sheet (details + CTA + close; internal scroll)

## GROWTH SYSTEM (REQUIRED)
Multi-stage cannabis growth with visible progression:
Seedling: sprout → seedling_1 → seedling_2
Vegetative: veg_1 → veg_2 → veg_3
Flower: stretch_1 → stretch_2 → bud_1 → bud_2 → bud_3
State must include: phase, stageName, stageIndex, stageProgress.

## Documentation Requirement (Reference Image)
The premium reference image will be provided in chat.
During implementation you must add it into:
`/docs/premium-reference.png`
and reference it in README.md (image preview) and docs/PLAN.md (as the visual target).

## Definition of Done (PASS)
Visual:
- Premium depth: glass + shadows + glow clearly visible
- Rings thick premium: 14–16px stroke for big rings, track+progress, round caps
- Cannabis plant unmistakably recognizable
UX:
- HUD fits ~100dvh, minimal/no scroll
- All secondary content in sheets
Functional:
- Tick loop runs
- Events trigger & resolve
- Actions work
- Boost counter shows X/6 today
- No console errors
