# Event Catalog Tuning Pass 01

## Ziel des Passes
Kontrollierter Daten-Autorenpass (ohne Runtime-Architekturänderung), um

- Warning-Dominanz zu reduzieren,
- Rare-Reichweite leicht zu erhöhen,
- Pool/Tone/Category-Metadaten gezielter zu setzen,
- Varianz zu verbessern,
- Resolver-/Follow-up-Stabilität zu erhalten.

## Analyse vor dem Pass
Vorher-Daten: `dev/event_runtime_stats.before_catalog_tuning_pass_01.json`

Haupttreiber der Warning-Dominanz:
- `late_flower_humidity` (sehr hohe Frequenz)
- `v2_pest_thrips_wave` (hohe Frequenz)
- mehrere v1-Events mit impliziter Fallback-Klassifikation auf Warning

Warum Rare zu niedrig war:
- nur 3 explizite Rare-Events im aktiven Laufzeitkatalog,
- niedrige Rare-Gewichte/Verfügbarkeit,
- mehrere positive/ungewöhnliche Momente waren nicht als Rare gekennzeichnet.

Sichere Strategie:
- kleine, konservative Metadaten-/Gewichtsanpassungen bei wenigen Events,
- keine Mechanik- oder Resolver-Logikänderung,
- keine Massenumschreibung.

## Geänderte Events und Änderungen

### Datei `data/events.json`
1. `beneficial_fungi_colonized`
- `pool`: `rare`
- `tone`: `positive`
- `category`: `positive`
- `weight`: `0.95`

Begründung: seltenes, positives Bodenbiologie-Moment; passt als „special moment“.

2. `watering_gap`
- `pool`: `recovery`
- `tone`: `neutral`
- `category`: `water`
- `weight`: `0.9`

Begründung: eher Korrektur-/Recovery-Situation als reiner Warning-Impuls.

3. `cold_root_zone`
- `pool`: `recovery`
- `tone`: `neutral`
- `category`: `environment`
- `weight`: `0.9`

Begründung: kann aktiv stabilisiert werden; nicht nur negativ.

4. `hot_dry_day`
- `pool`: `recovery`
- `tone`: `neutral`
- `category`: `environment`
- `weight`: `0.92`

Begründung: Management-/Anpassungsereignis, gut als Recovery eingeordnet.

5. `late_flower_humidity`
- `pool`: `warning`
- `tone`: `negative`
- `category`: `disease`
- `weight`: `0.85` (konservative Reduktion)
- `allowedPhases`: `flowering`, `harvest` (beibehalten)

Begründung: dominantes Warning-Event wurde bewusst leicht gedämpft, nicht entfernt.

### Datei `data/events.v2.json`
6. `v2_pest_thrips_wave`
- `pool`: `warning`
- `tone`: `negative`
- `weight`: `0.82` (von `0.95`)
- `allowedPhases`: `vegetative`, `flowering`, `harvest` (beibehalten)

Begründung: dominantes Warning-Event gezielt gedämpft, Scope nicht hart beschnitten.

7. `v2_environment_cold_night`
- `weight`: `1.05` (von `0.85`)

Begründung: seltenes Umweltmoment etwas sichtbarer machen.

8. `v2_positive_ideal_mild_days`
- `weight`: `1.15` (von `1.05`)

Begründung: Rare-positive Fenster leicht stärken.

9. `v2_positive_outdoor_sun_window`
- `pool`: `rare`
- `tone`: `positive`
- `weight`: `1.08` (von `0.95`)

Begründung: klarer „special moment“, passend als Rare-Positive.

10. `v2_special_weather_shift`
- `weight`: `0.88` (von `0.62`)

Begründung: Rare-Umweltmoment etwas erreichbarer machen, ohne Spam-Risiko.

## Lint-/Authoring-Effekt
`node dev/verify_event_pool_authoring.js`

- Explizite Pool-Events: **14 -> 21**
- Inferred-Pool-Events: **24 -> 17**
- Ambiguous inferred: **12 -> 7**
- Rare total (explizit): **3 -> 5**
- Warnings im Lint: **4 -> 3** (keine Errors)

## Runtime Before/After

Vorher (vor Pass):
- Total events: 1465
- Warning: 1012 (**69.08%**)
- Reward: 372 (25.39%)
- Recovery: 73 (4.98%)
- Rare: 8 (**0.55%**)
- Resolver influence: 23.96%
- Follow-up chains: 46/46

Nachher (nach Pass):
- Total events: 1396
- Warning: 897 (**64.26%**)
- Reward: 369 (26.43%)
- Recovery: 117 (8.38%)
- Rare: 13 (**0.93%**)
- Resolver influence: 24.36%
- Follow-up chains: 49/49

### Dominante IDs (Ausschnitt)
Vorher Top:
- `late_flower_humidity`: 392
- `v2_pest_thrips_wave`: 215

Nachher Top:
- `late_flower_humidity`: 327
- `v2_pest_thrips_wave`: 192

=> Beide dominanten Warning-IDs wurden reduziert.

## Bewertung des Passes
Verbessert:
- Warning-Dominanz messbar reduziert.
- Rare-Reichweite leicht erhöht.
- Recovery-Anteil deutlich verbessert.
- Resolver-Einfluss stabil geblieben.
- Follow-up-Chains stabil.
- Metadaten-Intentionalität klar erhöht (mehr explizite Pools/Tones).

Noch schwach:
- Warning-Anteil bleibt über dem Zielkorridor (noch >60%).
- Rare bleibt knapp unter 1% Zielunterkante.

## Fokus für Pass 02
Empfohlen: kleiner zweiter Autorenpass auf 3–5 verbleibende High-Frequency-Warnings mit impliziter Klassifikation (`topsoil_mold`, `overfeeding_warning`, `soil_life_decline`, ggf. `ph_drift_high`) und vorsichtiger Rare-/Reward-Feinjustierung, ohne Trigger-Mechanik umzubauen.
