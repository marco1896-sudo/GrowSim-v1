# Event Analysis (10 Full Runs)

## 1. Gesamtübersicht
- Runs: 10
- Gesamt-Events: 415
- Durchschnittliche Eventrate pro Run: 41.5
- Positive Events: 107 (25.78%)
- Negative Events: 308 (74.22%)

## 2. Event-Verteilung (Top 10)
| Event ID | Count |
|---|---:|
| v2_water_dry_pot | 85 |
| v2_positive_ideal_mild_days | 75 |
| v2_special_weather_shift | 58 |
| v2_pest_thrips_wave | 56 |
| v2_environment_heat_spike | 42 |
| v2_outdoor_storm_front | 35 |
| v2_positive_outdoor_sun_window | 32 |
| v2_pest_mites_spotted | 32 |

## 3. Positive vs Negative
| Type | Count | Percent |
|---|---:|---:|
| Positive | 107 | 25.78% |
| Negative | 308 | 74.22% |

## 4. Stage Analyse
- Stage 2: v2_environment_heat_spike (1)
- Stage 3: v2_positive_ideal_mild_days (15), v2_water_dry_pot (11), v2_environment_heat_spike (2)
- Stage 4: v2_water_dry_pot (12), v2_special_weather_shift (10), v2_positive_ideal_mild_days (9), v2_positive_outdoor_sun_window (6), v2_pest_mites_spotted (6)
- Stage 5: v2_water_dry_pot (9), v2_positive_outdoor_sun_window (7), v2_pest_thrips_wave (7), v2_positive_ideal_mild_days (6), v2_environment_heat_spike (6)
- Stage 6: v2_water_dry_pot (12), v2_positive_ideal_mild_days (8), v2_special_weather_shift (6), v2_pest_thrips_wave (6), v2_outdoor_storm_front (5)
- Stage 7: v2_water_dry_pot (13), v2_positive_ideal_mild_days (7), v2_special_weather_shift (6), v2_pest_thrips_wave (6), v2_outdoor_storm_front (5)
- Stage 8: v2_water_dry_pot (14), v2_positive_ideal_mild_days (8), v2_pest_thrips_wave (8), v2_special_weather_shift (7), v2_outdoor_storm_front (5)
- Stage 9: v2_water_dry_pot (14), v2_positive_ideal_mild_days (9), v2_special_weather_shift (8), v2_pest_thrips_wave (7), v2_positive_outdoor_sun_window (4)
- Stage 10: v2_pest_thrips_wave (11), v2_special_weather_shift (9), v2_positive_ideal_mild_days (7), v2_environment_heat_spike (6), v2_outdoor_storm_front (6)
- Stage 11: v2_pest_thrips_wave (9), v2_special_weather_shift (7), v2_positive_ideal_mild_days (6), v2_environment_heat_spike (6), v2_pest_mites_spotted (5)
- Stage 12: v2_environment_heat_spike (2), v2_pest_thrips_wave (2)

## 5. Auffälligkeiten
- Stage-unlogische Events: 0
- Identisches Event direkt nacheinander: 0
- Rain/Storm-Ketten (Cooldown-Muster): 0
- Balance-Hinweis: Positive Event-Anteil (25.78%) liegt außerhalb Zielband 30–50%.

## 6. Empfehlungen
- Positive-Events nur bei stabilen Zuständen triggern, zusätzliches globales Positiv-Cap prüfen.
- Outdoor-Event-Cooldowns (rain/storm) weiter erhöhen, falls in Live-Runs Ketten sichtbar.
- Für frühe Stages harte Trigger-Gates für disease/weather lassen (bereits aktiv), bei neuen Events beibehalten.
- Harness und Runtime-Gewichtungslogik regelmäßig gegenprüfen, damit Balancing reproduzierbar bleibt.

## 7. Stabilitätstest
- Keine Crashes in 10 Full-Runs
- Keine undefined state transitions beobachtet
- Keine unendlichen Event-Cooldowns im Runner
