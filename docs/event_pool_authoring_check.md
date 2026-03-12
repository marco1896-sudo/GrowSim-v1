# Event Pool Authoring Check

## Purpose
`dev/verify_event_pool_authoring.js` is a **lint / authoring-quality** check for resolver pool metadata quality.
It reports catalog quality signals without changing resolver logic or gameplay behavior.

It inspects the same runtime catalog sources used by `loadEventCatalog()`:
- `data/events.json`
- `data/events.foundation.json` (optional)
- `data/events.v2.json` (optional)

## What the lint checks

### 1) Explicit vs inferred pool coverage
For each runtime event, it classifies pool routing as:
- **explicit**: `pool` is authored directly on the event.
- **inferred**: `pool` is missing, so resolver inference rules apply.

Inference order mirrors resolver behavior:
1. `tags` contains `rare` -> `rare`
2. `isFollowUp === true` -> `recovery`
3. reward hints (`tags` includes `reward`, positive `tone`, or `category=positive`) -> `reward`
4. warning hints (negative `tone`, or category in `disease|pest|water|nutrition|environment`) -> `warning`
5. fallback -> `stress`

The lint also flags potentially ambiguous inferred cases (for example, fallback-only or conflicting reward/warning hints).

### 2) Rare pool density by phase
The lint summarizes rare-pool density using runtime `allowedPhases` metadata:
- rare event count per phase
- phases with zero rare events
- optional skew warning when one phase is much denser than others

If rare events have missing/empty `allowedPhases`, they are reported as unscoped (allow-all).

### 3) Metadata quality signals
The lint reports quality drift signals for:
- missing/invalid `tone`
- missing `category`
- missing/empty `allowedPhases`
- follow-up events with weak metadata hints

## Severity model
- **Errors**: structurally unsafe metadata (for example invalid tone values, or non-optional source parse failures).
- **Warnings**: authoring-quality issues that can degrade balancing clarity (ambiguous inference, missing tone/category, sensitive unscoped events).
- **Info**: visibility summaries and lower-risk drift signals (allow-all scope totals, zero-rare phases).

## Typical output sections
- pool coverage summary
- inferred-pool summary
- rare distribution by phase
- metadata warning summary
- grouped error/warning/info findings

## Recommended authoring direction
Prefer explicit authoring for routing-critical metadata:
1. Add explicit `pool` for events where intent matters for balancing.
2. Keep `tone` and `category` explicit (avoid relying on defaults).
3. Use `allowedPhases` intentionally for rare and follow-up content.
4. Use this lint in verification flow to monitor drift over time.

## Run
```bash
node dev/verify_event_pool_authoring.js
```

## First focused authoring pass

### Scope and selection rationale
A small first tranche targeted high-frequency early-cycle stress/warning events in `data/events.json` that were previously defaulting ambiguously:
- `soil_compaction`
- `fungus_gnat_wave`
- `nitrogen_lockout`
- `magnesium_deficit`
- `salt_buildup`
- `soil_too_wet`
- `dry_pocket`
- `ph_drift_high`

These were chosen because they strongly shape early gameplay feel and were prominent in inferred/fallback warning output.

### Metadata added
For this tranche:
- Added explicit `pool: "warning"` to all eight events.
- Added explicit `tone: "negative"` to all eight events.
- Added `category` where clearly unambiguous:
  - `pest`: `fungus_gnat_wave`
  - `water`: `soil_too_wet`, `dry_pocket`
  - `nutrition`: `nitrogen_lockout`, `magnesium_deficit`, `salt_buildup`, `ph_drift_high`
- Left `soil_compaction` category unchanged to avoid forcing a potentially ambiguous label.

Additionally, a narrow structural fix was applied to `data/events.foundation.json` so the optional source parses again (duplicate `"weight"` keys without separators were removed).

### Measured lint improvement
After this pass and the foundation parse fix:
- Runtime sources skipped due to parse/shape issues: **1 -> 0**
- Runtime events analyzed: **35 -> 38**
- Explicit pool events: **0 -> 11**
- Ambiguous inferred pool events: **20 -> 12**
- Missing tone: **35 -> 27**
- Missing category: **20 -> 13**
- Guard metadata parse errors: **1 -> 0**
- Guard metadata tone warnings: **35 -> 27**

### Remaining gaps for later passes
- Rare pool coverage remains absent across all phases.
- Remaining v1 events still rely on inferred category/tone/pool metadata.
- Most v2 events still rely on defaulted tone and inferred pool routing.

## Rare pool activation pass

### Scope and selection rationale
This pass intentionally stayed small and only marked three existing v2 events as rare:
- `v2_environment_cold_night`
- `v2_positive_ideal_mild_days`
- `v2_special_weather_shift`

Why these qualify as rare:
- They represent uncommon, high-signal moments (microclimate anomaly or unusually stable favorable window), not routine stress loops.
- They are narrative "special moments" with controlled impact and no structural gameplay changes.
- Existing triggers/cooldowns already keep them situational; this pass only clarified pool routing metadata.

### Metadata authored
In `data/events.v2.json`, each selected event received:
- `pool: "rare"`
- explicit `tone` aligned to event intent:
  - `v2_environment_cold_night` -> `tone: "neutral"`
  - `v2_positive_ideal_mild_days` -> `tone: "positive"`
  - `v2_special_weather_shift` -> `tone: "neutral"`

No resolver logic, guard pipeline, trigger logic, options, or follow-up structure changed.

### Phase coverage added by this tranche
- `v2_environment_cold_night`: `seedling`, `vegetative`, `flowering`
- `v2_positive_ideal_mild_days`: `vegetative`, `flowering`, `harvest`
- `v2_special_weather_shift`: `vegetative`, `flowering`, `harvest`

Result: rare pool is now represented in all observed runtime phases (`seedling`, `vegetative`, `flowering`, `harvest`).

### Measured lint improvement
From `node dev/verify_event_pool_authoring.js`:
- Explicit pool events: **11 -> 14**
- Inferred pool events: **27 -> 24**
- Rare events total: **0 -> 3**
- Rare phase coverage:
  - flowering: **0 -> 3**
  - harvest: **0 -> 2**
  - seedling: **0 -> 1**
  - vegetative: **0 -> 3**
- Missing tone: **27 -> 24**
- `rare.phase_zero` info finding: **present -> resolved**
- Errors: **0 -> 0** (no new errors introduced)

Note: a new balancing-quality warning appears (`rare.phase_density_skew`) because the initial tranche is intentionally small and concentrated. This is expected for a minimal activation pass.
