# Balance Harness (lokal, deterministisch)

## Zweck
`dev/balance_harness.js` simuliert mehrere komplette Runs (56 Sim-Tage) offline und gibt Balancing-Metriken aus.

## Start
Im Projektordner:

```bash
node dev/balance_harness.js --runs 50 --strategy careful --seed 12345
```

## Parameter
- `--runs` Anzahl Runs (Default: `20`)
- `--strategy` `careful` | `aggressive` | `neglect` (Default: `careful`)
- `--seed` optionaler Basisseed; bei mehreren Runs wird `:index` angehängt

## Strategien
- `careful`: stressarm, bevorzugt niedrige/mittlere Intensitäten
- `aggressive`: höhere Intensitäten, mehr Risiko für Wachstum
- `neglect`: handelt selten, ignoriert häufiger ungünstige Optionen

## Ausgaben
Pro Run:
- finaler Qualitätstier
- finale Stufe
- Eventanzahl + Events pro Kategorie
- Aktionen pro Kategorie/Intensität
- Durchschnittswerte (Health/Stress/Risk)
- Maximalwerte (Stress/Risk)
- Cooldown-Blockaden
- Top-5 Event-IDs

Aggregiert über alle Runs:
- Verteilung der Qualitätstier
- Mittel/Median Events pro Run
- Mittel/Median Stress und Health

## Determinismus
- Kein `Math.random`
- deterministische Hash-basierte Auswahl
- gleiche Seeds + gleiche Strategie => identische Ergebnisse

## Hinweise
- Lokal/offline, keine externen Dienste
- Nutzt `data/actions.json` und `data/events.v2.json`
