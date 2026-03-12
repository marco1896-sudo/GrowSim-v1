# Resolver Replay Harness

## Purpose
The resolver replay harness is a deterministic diagnostic tool for regression testing resolver selection behavior over multiple ticks.

It is designed to catch unintentional behavior shifts when:
- guard logic changes,
- event metadata changes,
- resolver integration logic evolves.

The harness does **not** alter gameplay logic. It reuses the existing resolver (`src/events/eventResolver.js`) and foundation memory/flag behavior.

## Runner
Script: `dev/run_resolver_replay.js`

Example:

```bash
node dev/run_resolver_replay.js --ticks 50 --seed 123
```

### Arguments
- `--ticks <n>`: number of resolver ticks to simulate (default: `50`)
- `--seed <n>`: deterministic seed used for RNG (default: `123`)
- `--phase <phase>`: normalized phase used in replay state (default: `seedling`)
- `--out <path>`: output JSON path (default: `dev/replay_trace.json`)
- `--catalog <csv>`: optional comma-separated catalog JSON files (default:
  `data/events.foundation.json,data/events.json,data/events.v2.json`)

## Trace Output
The runner writes a structured JSON trace (default: `dev/replay_trace.json`) with per-tick decision details:

- `candidates`
- `afterPhaseGuard`
- `afterRepeatGuard`
- `afterFrustrationGuard`
- `pendingChainOverride` / `pendingChainId`
- `availablePools` / `selectedPool`
- `poolWeights` / `poolRoll` / `poolReason`
- `weights` / `weightedRoll`
- `selectedEvent`
- `selectedReason`
- `selectedOptionId`

This allows exact inspection of guard filtering and final selection over time.

## Regression Comparison
Script: `dev/compare_replay_trace.js`

Example:

```bash
node dev/compare_replay_trace.js --base dev/replay_trace.baseline.json --candidate dev/replay_trace.json
```

Comparison reports:
- changed `selectedEvent` values per tick,
- changed guard filtering outputs (`afterPhaseGuard`, `afterRepeatGuard`, `afterFrustrationGuard`),
- candidate ordering changes where candidate membership is the same but order differs.

Exit code behavior:
- `0` when traces are equivalent for tracked fields,
- `1` when differences are detected.

## Regression Workflow
1. Generate a baseline trace from a known-good commit and store it (e.g. `dev/replay_trace.baseline.json`).
2. Generate a candidate trace from the current branch.
3. Compare both traces using the compare helper.
4. Investigate any differences before merging.

This provides early warning for resolver stability regressions while preserving existing runtime behavior.
