# DEVELOPMENT_LOG_EVENT_SYSTEM

## Schritt 1 – Bestandsanalyse + Plan
- **Ziel:** Architektur aufnehmen und verpflichtenden Event-Plan erstellen.
- **Geänderte Dateien:**
  - `EVENT_SYSTEM_PLAN.md` (neu)
  - `DEVELOPMENT_LOG_EVENT_SYSTEM.md` (neu)
- **Implementierung:**
  - Projektstruktur analysiert (`app.js`, `data/events.json`, `data/events.v2.json`, `data/actions.json`, `dev/balance_harness.js`).
  - Event-Engine, Stage-System, Persistenz und vorhandene Triggerlogik dokumentiert.
  - Zielstruktur inkl. Stage-Zuordnung, Kategorien, Wahrscheinlichkeitslogik und Testplan festgelegt.
- **Testergebnis:**
  - Dokumentationsschritt, noch keine Runtime-Änderung.
- **Probleme:**
  - `Auftrag.md` liegt als `Auftrag.md.txt` vor (berücksichtigt).
- **Nächster Schritt:**
  - Kleine, sichere Runtime-Erweiterung: Event-Metadaten (Polarity/Environment) + Auswahlbalancing ergänzen.

## Schritt 2 – Event-Metadaten + Balancing-Grundlage
- **Ziel:** Event-System stage-/zustandsbezogen robuster machen, ohne Save-Format zu brechen.
- **Geänderte Dateien:**
  - `app.js`
- **Implementierung:**
  - Event-Normalisierung erweitert um:
    - `polarity` (`positive|negative|neutral`, mit konservativer Ableitung)
    - `environment` (`indoor|outdoor|both`, aus `triggers.setup.modeIn` abgeleitet)
  - Kategorien-Ableitung verbessert (`weather`/`positive`-Tags).
  - Deterministische Eventauswahl erweitert um `computeEventDynamicWeight()`:
    - leichte Gewichtserhöhung für Risiko-/Stress-passende negative Events
    - sanfte positive Gegenchance nach negativer Eventserie
    - vorsichtige Dämpfung von Disease-Events bei niedrigem Risiko
  - Event-Pick-Log erweitert (`pickedPolarity`, `pickedEnvironment`) für Nachvollziehbarkeit.
- **Testergebnis:**
  - `node --check app.js` ✅
- **Probleme:**
  - Keine Syntax-/Runtime-Fehler im Check.
- **Nächster Schritt:**
  - Outdoor- und positive/rare Events im v2-Katalog ergänzen und erneut balancen.

## Schritt 3 – v2-Eventkatalog erweitert (Outdoor + Positive + Special)
- **Ziel:** Stage-bezogene Realistik verbessern und Outdoor-Abdeckung erhöhen.
- **Geänderte Dateien:**
  - `data/events.v2.json`
- **Implementierung:**
  - Neue Events hinzugefügt:
    - `v2_outdoor_storm_front` (Outdoor/Greenhouse, Umweltstress)
    - `v2_outdoor_rain_series` (Outdoor/Greenhouse, Blüte-Nässe-/Schimmelrisiko)
    - `v2_positive_ideal_mild_days` (positive stabile Phase)
    - `v2_positive_outdoor_sun_window` (positives Outdoor-Wetterfenster)
    - `v2_special_weather_shift` (seltenes Wetterumschwung-Event)
  - Alle mit konservativen Lerntexten, Stage-Fenstern, Cooldowns und plausiblen Optionen.
- **Testergebnis:**
  - `node -e "JSON.parse(...events.v2.json...)"` ✅
  - `node dev/balance_harness.js --runs 5 --strategy careful --seed evtv2` ✅
  - `node dev/balance_harness.js --runs 3 --strategy aggressive --seed evtv2` ✅
  - `node dev/balance_harness.js --runs 3 --strategy neglect --seed evtv2` ✅
- **Probleme:**
  - Harness zeigt bei `careful` aktuell sehr positive Eventlast (erwartbar wegen sehr stabiler Strategie + Trigger), wird in nächster Iteration feinjustiert.
- **Nächster Schritt:**
  - Anti-Spam-/Balancing-Feintuning zwischen Strategien (insb. positive Dominanz vs. Eventdichte) + manuelle UI-Regression.

## Schritt 4 – Anti-Spam erweitert (Kategorie-Cooldown + Polarity-Dämpfung)
- **Ziel:** Event-Ketten nachvollziehbarer machen und Wiederholungen derselben Event-Art bremsen.
- **Geänderte Dateien:**
  - `app.js`
- **Implementierung:**
  - Scheduler um `categoryCooldowns` erweitert.
  - Eligibility prüft jetzt neben Per-Event-Cooldown auch Category-Cooldown.
  - Beim Abschluss eines Events wird Category-Cooldown gesetzt (für `positive` explizit länger).
  - Dynamische Gewichtslogik ergänzt um Dämpfung bei mehrfach positiven Recent-Events.
  - State-Integrity/Sync um neue Scheduler-Struktur ergänzt.
- **Testergebnis:**
  - `node --check app.js` ✅
  - `node -e "JSON.parse(...events.v2.json...)"` ✅
  - `node dev/balance_harness.js --runs 3 --strategy careful --seed evtv3` ✅
  - `node dev/balance_harness.js --runs 2 --strategy aggressive --seed evtv3` ✅
- **Probleme:**
  - Der Harness bildet Runtime-Category-Cooldowns nicht 1:1 nach (bekannte Lücke zwischen Browser-Engine und Harness). Deshalb bleibt die `careful`-Verteilung im Harness stark positiv.
- **Nächster Schritt:**
  - Harness-Logik angleichen (Category-Cooldowns + dynamische Gewichte), dann erneut balancen und dokumentieren.

## Schritt 5 – QA Event Runner (10 Full Runs, reproduzierbar)
- **Ziel:** Automatisierte End-to-End Simulationstests für Event-System-Stabilität und Balance.
- **Geänderte Dateien:**
  - `test/event-runner.js` (neu)
  - `test/results/run_results.json` (neu)
  - `test/results/event_log_run_1.json` ... `test/results/event_log_run_10.json` (neu)
  - `test/results/event_analysis.md` (neu)
- **Implementierung:**
  - Headless Simulation-Runner gebaut (`runSimulationTest`) mit 56 Sim-Tagen pro Run.
  - 10 deterministische Runs mit Seeds `qa-run-1..10`.
  - Spielerprofile: careful (1-3), normal (4-6), neglect (7-10).
  - Modi variiert: indoor/greenhouse/outdoor.
  - Pro Event geloggt: Day, Stage, Event-ID, Category, Polarity, Environment, Stress, Status-Delta.
  - Validierungen integriert:
    - Stage-Plausibilität (u.a. kein Storm in Keimung, kein Mold zu früh)
    - Cooldown-Verletzungen (identisches Event direkt nacheinander)
    - Category-Kettenprüfung (Rain/Storm-Muster)
    - Positive/Negative Balance-Auswertung
  - Analysebericht automatisch erzeugt (`event_analysis.md`).
- **Testergebnis (Kernaussagen):**
  - 10 Runs stabil ohne Crash.
  - Gesamt: 473 Events, Ø 47.3 Events/Run.
  - Positive: 26%, Negative: 74% (unter Zielband für positive Events).
  - Stage-Verletzungen: 0.
  - Identische Direkt-Folgen: 49 (Auffälligkeit, weiterhin zu hoch).
- **Probleme / Befunde:**
  - Event-Verteilung noch stark von `v2_water_dry_pot` dominiert.
  - Positive Eventrate liegt unter Ziel (30–50%).
  - Cooldown-Regeln im Runner zeigen noch Wiederholungsdruck in bestimmten Profilen.
- **Nächster Schritt:**
  - `v2_water_dry_pot` Trigger/Gewicht entschärfen, positive Gegenereignisse früher ermöglichen, zusätzliche Wiederholungsbremse auf Event-ID-Ebene einziehen.

## Schritt 6 – Event Fix Runde 1 + Death-Screen UX
- **Ziel:** Stabiler Tester-Stand mit weniger Event-Spam und klaren Fail-State-Hauptaktionen.
- **Geänderte Dateien:**
  - `app.js`
  - `data/events.v2.json`
  - `index.html`
  - `test/event-runner.js`
  - `test/results/run_results.json`
  - `test/results/event_log_run_1..10.json`
  - `test/results/event_analysis.md`
  - `DEATH_SCREEN_IMPLEMENTATION.md` (neu)
- **Implementierte Fixes (PRIO 1):**
  1. **`v2_water_dry_pot` entschärft**
     - Trigger enger: Wasser <= 30, Stress >= 25, Stage 3-9.
     - Gewicht reduziert: 1.4 -> 0.9.
     - Cooldown erhöht: 160 -> 260 min.
  2. **Direkt-Wiederholungsbremse auf Event-ID**
     - Auswahl blockt direkte Wiederholung der letzten Event-ID, sofern Alternativen vorhanden.
  3. **Positive Gegenereignisse fairer angehoben**
     - `v2_positive_ideal_mild_days`: Trigger gelockert (Stress/Risk), Weight erhöht (0.85 -> 1.05).
     - `v2_positive_outdoor_sun_window`: Trigger leicht gelockert, Weight erhöht (0.78 -> 0.95).
- **Implementierte Fixes (PRIO 2 Death UX):**
  - Death-Overlay mit drei klaren Aktionen in Priorität:
    1) Rettungsaktion nutzen
    2) Neuen Run starten
    3) Analyse ansehen
  - Rettungsaktion 1× pro Run klar angezeigt/deaktiviert nach Verbrauch.
  - Rettung bringt Pflanze in kritischen, aber spielbaren Zustand zurück (inkl. Score-Malus, Wasser/Nährstoff-Minimum, Stress-/Risikosenkung).
  - `Neuen Run starten` im Death-Overlay mit Confirm-Dialog.
- **Tests (PRIO 3):**
  - `node --check app.js` ✅
  - `node --check test/event-runner.js` ✅
  - JSON-Validierung `events.v2.json` ✅
  - 10 Full-Runs QA erneut ausgeführt ✅
- **Vorher/Nachher (QA-Runs):**
  - Gesamt-Events: **473 -> 415**
  - Positive/Negative: **26/74 -> 25.78/74.22** (leicht verbessert auf Eventmix-Ebene in careful/normal, aber gesamt noch unter Zielband)
  - Identische direkte Wiederholung: **49 -> 0**
  - Stage-Verletzungen: **0 -> 0**
  - Rain/Storm-Ketten: **0 -> 0**
  - `v2_water_dry_pot` Dominanz: **148 -> 85**
- **Offene Restpunkte:**
  - Positivanteil gesamt weiterhin unter Zielband 30-50% (neglect-Runs drücken stark nach unten).
  - Für produktive Balance als nächster Schritt: Strategie-/Setup-sensitive Positivkorridore und Neglect-spezifische Caps weiter feinjustieren.
- **Nächster Schritt:**
  - Optional Fix Runde 2 nur auf Positiv-/Negativ-Balance (ohne weitere UX-Änderungen), danach erneuter 10-Run-Vergleich.

## Schritt 4 – Anti-Spam erweitert (Kategorie-Cooldowns)
- **Ziel:** Event-Spam reduzieren und wiederholte Eventmuster besser brechen.
- **Geänderte Dateien:**
  - `app.js`
- **Implementierung:**
  - Scheduler um `categoryCooldowns` erweitert (State-Init, Canonicalisierung, Reset, Integrity-Cleanup).
  - Eligibility prüft jetzt zusätzlich Category-Cooldown.
  - Beim Abschluss eines Events wird ein Category-Cooldown gesetzt:
    - Standard: `EVENT_COOLDOWN_MS`
    - `positive` mindestens 45 Minuten.
  - Event-Weighting für positive Serien verschärft (bei wiederholten positiven Events sinkt Gewicht).
- **Testergebnis:**
  - `node --check app.js` ✅
- **Probleme:**
  - Balance-Harness bildet App-Runtime nicht 1:1 ab (separate Selektionslogik); daher keine direkte Aussage über neue Category-Cooldowns im Harness.
- **Nächster Schritt:**
  - Harness an Runtime-Logik angleichen oder kleinen Runtime-Test-Hook ergänzen für reproduzierbare Event-Eligibility-Tests.
