# Event System Playability Pass Final

## Ausgangsproblem vor diesem Pass
Nach dem vorherigen Tuning war die Runtime-Architektur stabil, aber das SpielgefÃ¼hl war noch zu negativ geprÃ¤gt:

- Warning-Anteil zu hoch (64.26%)
- Recovery zu niedrig (8.38%)
- Rare unter 1% (0.93%)
- einzelne Warning-IDs dominierten stark

## GewÃ¤hlte Strategie (heutiger finaler Mini-Pass)
Kein Architekturumbau, nur kontrollierte Katalog-Autorung:

1. dominante Warning-Dynamik entschÃ¤rfen (moderate Gewichtsanpassung)
2. Recovery-Raum erweitern Ã¼ber klar begrÃ¼ndbare Re-Klassifizierung einzelner Korrektur-Events
3. Rare-Sichtbarkeit leicht erhÃ¶hen (ohne Rare-Spam)
4. Resolver-/Replay-/Persistenz-VertrÃ¤ge unangetastet lassen

## GeÃ¤nderte Events (finaler Stand)

### `data/events.json`
- `topsoil_mold`
  - `pool: recovery`, `tone: neutral`, `category: disease`, `weight: 0.92`
- `overfeeding_warning`
  - `pool: recovery`, `tone: neutral`, `category: nutrition`, `weight: 0.9`
- `soil_life_decline`
  - `pool: recovery`, `tone: neutral`, `category: nutrition`, `weight: 0.95`
- `ph_drift_high`
  - `pool: recovery`, `tone: neutral`, `weight: 0.95`
- `salt_buildup`
  - `pool: recovery`, `tone: neutral`, `weight: 0.95`
- `beneficial_fungi_colonized`
  - `pool: rare`, `tone: positive`, `category: positive`, `weight: 1.05`
- `cold_root_zone`
  - `pool: recovery`, `tone: neutral`, `category: environment`, `weight: 0.9`
- `hot_dry_day`
  - `pool: recovery`, `tone: neutral`, `category: environment`, `weight: 0.92`
- `watering_gap`
  - `pool: recovery`, `tone: neutral`, `category: water`, `weight: 0.9`
- `late_flower_humidity`
  - explizit Warning-Metadaten beibehalten, `weight: 0.6`

### `data/events.v2.json`
- `v2_pest_thrips_wave`
  - explizit `pool: warning`, `tone: negative`, `weight: 0.6`
- `v2_outdoor_storm_front`
  - `pool: rare`, `tone: neutral`, `weight: 0.9`
- `v2_positive_outdoor_sun_window`
  - `pool: rare`, `tone: positive`, `weight: 1.08`
- `v2_environment_cold_night`
  - `weight: 1.05`
- `v2_positive_ideal_mild_days`
  - `weight: 1.15`
- `v2_special_weather_shift`
  - `weight: 0.95`

## Before/After Runtime-Metriken

Vergleich:
- Before: `dev/event_runtime_stats.before_playability_pass_final.json`
- After: `dev/event_runtime_stats.json`

### Pools
- Warning: 64.26% -> **59.51%**
- Reward: 26.43% -> **26.93%**
- Recovery: 8.38% -> **11.86%**
- Rare: 0.93% -> **1.70%**

### StabilitÃ¤t
- Resolver influence: 24.36% -> **23.11%** (gleiches Niveau, leicht niedriger)
- Follow-up chains: 49/49 -> **51/50** (nahezu stabil, 1 Chain bleibt offen)

### Dominante IDs (Top-Ausschnitt)
Vorher:
- `late_flower_humidity`: 327
- `v2_pest_thrips_wave`: 192

Nachher:
- `late_flower_humidity`: 352
- `v2_pest_thrips_wave`: 211

Interpretation:
- Die **Pool-Balance** wurde deutlich verbessert.
- Die **absoluten Top-ID-HÃ¤ufigkeiten** der zwei grÃ¶ÃŸten Warning-Treiber sind in dieser Stichprobe nicht gesunken.

## Was verbessert wurde
- Warning-Dominanz klar reduziert (unter 60%).
- Recovery liegt jetzt im Zielkorridor (10-15%).
- Rare ist sichtbar im Zielkorridor (1-2%).
- Resolver-Einfluss bleibt in stabilem Bereich um ~24%.
- Alle Kern-Checks bleiben grÃ¼n.

## Was noch nicht perfekt ist
- Die zwei dominanten Warning-IDs (`late_flower_humidity`, `v2_pest_thrips_wave`) bleiben trotz Gewichtsreduktion weiterhin sehr dominant.
- Follow-up-VerhÃ¤ltnis ist fast stabil, aber nicht exakt 1:1 in jedem Lauf.

## Ehrliches Gesamturteil
**Ja, das System ist jetzt spielbar fÃ¼r heute.**

BegrÃ¼ndung:
- Die Verteilung wirkt deutlich weniger strafend.
- Rare-Momente sind sichtbar.
- Recovery bietet spÃ¼rbar mehr Entlastung.
- Die technischen Garantien (Tests/Replay/Persistenz) bleiben intakt.

Es ist noch nicht final-balanciert, aber als Tagesabschluss in einem klar besseren, praxistauglichen Zustand.
