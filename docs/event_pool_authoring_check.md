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
