# FULL EVENT SYSTEM RUNTIME ANALYSIS

## Executive Summary
Das Projekt ist ein browserbasierter Grow-Simulator mit deterministischem Simulationskern, Ereignis-FSM, Aktionssystem, Persistenzschicht und UI-Layer.  
Die Event-Architektur ist technisch funktionsfähig und testbar, aber das **tatsächliche Laufzeitverhalten** zeigt eine klare Dominanz des Legacy-Selektionspfads gegenüber dem Resolver:

- In der durchgeführten deterministischen Simulation (4 Seeds, je 1000 Event-Ticks) wurden **1531 Events** ausgelöst.
- Nur **55/1531 (3,59%)** wurden direkt durch Resolver-Entscheidung erzwungen.
- **1476/1531 (96,41%)** kamen aus der Legacy-gewichteten Auswahl.
- Rare-Events sind erreichbar, aber selten: **9/1531 (0,59%)**.
- Pool-Verteilung: `warning` dominiert deutlich (`1038`), danach `reward` (`396`), `recovery` (`88`), `rare` (`9`).

Fazit: Das System ist als Grundlage stabil, aber die gewünschte Resolver-zentrierte Steuerung ist in der Praxis nur schwach wirksam.

---

## 1) Projektverständnis (statische Architektur)

### Zweck der Anwendung
Der Grow Simulator simuliert einen kompletten Pflanzenlauf (Statusdrift, Wachstum, Events, Spieleraktionen, Risiko- und Qualitätsentwicklung) in Echtzeit-komprimierter Form.

### Laufzeit-Ziel
- Kontinuierliche Tick-basierte Simulation
- Event-getriebene Entscheidungsfenster
- Persistenter Spielzustand (offline-fähig)
- UI-HUD + Sheets + Overlays + Notifications

### Hauptmodule
- `index.html`: Script-Lade-Reihenfolge und DOM-Struktur.
- `app.js`: Boot-Orchestrierung, Domain-Wiring, Katalog-Laden, UI/State-Brücken, Legacy-Fallback-Funktionen.
- `sim.js`: Tick-Schleife, Simulationsdelta, Offline-Catchup, Drift/Growth, Event-FSM-Aufruf pro Tick.
- `events.js`: Event-FSM, Aktivierung, Triggerprüfung, Cooldowns, Resolver-Bridge, Choice-Auflösung.
- `ui.js`: UI-Cache/Bindings/Rendering.
- `storage.js`: Restore/Persist/Migration/Integrity/Canonical-State.
- `notifications.js`: Push/Reminder/Critical/Event-Availability.
- `src/events/*`: Foundation-Subsysteme (Flags/Memory/Analysis/Resolver).

### Boot-Sequenz (realer Pfad)
1. `DOMContentLoaded` ruft `boot()` auf (`app.js`).
2. `cacheUi()` + `ensureRequiredUi()`.
3. Storage-Adapter initialisieren.
4. `restoreState()` -> `migrateState()` -> `ensureStateIntegrity()`.
5. `loadEventCatalog()` (`events.json` -> `events.foundation.json` -> `events.v2.json`) und `loadActionsCatalog()`.
6. UI binden, Hintergrund setzen, SW registrieren.
7. `syncSimulationFromElapsedTime()` (Offline-Catchup), Runtime-Sync, Overlay-Sync.
8. Start der Tick-Schleife via `setInterval(tick, tickIntervalMs)`.

Referenzen:
- Script-Order: `index.html:293-303`
- Boot: `app.js:435`
- Katalogladen: `app.js:4658`
- Tick-Start: `app.js:493-499`
- Tick selbst: `sim.js:3`

### Tick-Scheduling und UI-Update-Flow
- Tick läuft in `sim.js:tick()`.
- `applySimulationDelta()` führt Drift, aktive Effekte, Wachstum und Event-FSM aus.
- Danach HUD/EventSheet/Analysis/DeathOverlay rendern.
- Persistenz wird geplant (debounced).

Referenzen:
- Tick: `sim.js:3-45`
- Delta-Pipeline: `sim.js:59-91`
- Event-FSM-Aufruf im Tick: `sim.js:85`

---

## 2) Event-System-Architektur

### 2.1 Event-Kataloge und Lade-Reihenfolge
Reihenfolge:
1. `data/events.json` (v1, required by intent)
2. `data/events.foundation.json` (optional foundation)
3. `data/events.v2.json` (optional erweitertes Set)

Wenn nichts geladen werden kann, wird ein minimaler Fallback-Event erzeugt.

Referenz: `app.js:4658-4717`

### 2.2 Optional vs. Required
- `events.foundation.json` und `events.v2.json` sind optional (try/catch ohne Boot-Abbruch).
- `events.json` ist logisch primär, aber auch mit Fallback geschützt.

### 2.3 Normalisierung
`normalizeEvent()` vereinheitlicht:
- `choices`/`options` -> `options`
- `category`, `weight`, `severity`, `cooldownRealMinutes`
- `triggers`, `allowedPhases`, `tags`, `polarity`, `environment`

Referenz: `events.js:950+` (gleiche Struktur in `app.js`)

### 2.4 Resolver-Logik
`src/events/eventResolver.js`:
- Hard-Conditions (z. B. `high_water`, `stable_growth`)
- Guard-Pipeline: `phase -> repeat -> frustration`
- Pooling: `warning/reward/recovery/rare/stress`
- Gewichtete Pool-Selektion + gewichtete Kandidatenselektion
- Pending-Chain-Override und Flag-Override

Referenzen:
- Guard-Pipeline: `eventResolver.js:117-147`
- Pool-Inferenz/-Selektion: `eventResolver.js:179-332`
- Endentscheidung mit Trace: `eventResolver.js:334-474`

### 2.5 Guard-Pipeline
- `applyPhaseGuard`
- `applyRepeatGuard`
- `applyFrustrationGuard`
- Fallback auf Originalkandidaten, wenn Frustration-Filter alles entfernt

### 2.6 Pool-System
- Explizit via `event.pool`
- Sonst Inferenz aus `tags`, `tone`, `category`
- Rare wird bevorzugt gedämpft (Multiplier `0.35`)
- Bei negativer Serie werden `recovery/reward` gepusht

### 2.7 Weighting-System
1. Resolver-internes Kandidatengewicht (aus Kataloggewicht)
2. Legacy-Dynamikgewichtung in Event-Auswahl (`computeEventDynamicWeight`)

### 2.8 Pending-Chains
`src/events/eventMemory.js` verwaltet `pendingChains`:
- `set/get/consume/clear`
- Trim auf max. 12
- Expiry-Pruning

### 2.9 Analysis-Generierung
`src/events/eventAnalysis.js` erzeugt Outcome-Analysen pro Entscheidung (Tone, Action/Cause/Result/Guidance) und speichert bis 40 Einträge.

### 2.10 Memory/History
- Foundation-Memory: `events`, `decisions`, `pendingChains`
- Runtime-History: `state.events.history` + `state.history.events`

### 2.11 Event-Lifecycle (Soll/Ist)
`idle -> candidate evaluation -> resolver selection -> activation -> decision -> follow-up -> cooldown -> idle`

Codepfad:
- `runEventStateMachine()` (`events.js`)
- `activateEvent()` (`events.js`)
- `onEventOptionClick()` (`events.js`)
- `enterEventCooldown()` (`events.js`)

---

## 3) Runtime-Flow-Trace (Tick bis Event-Aktivierung)

1. `tick()` startet (`sim.js`), setzt `nowMs`, erhöht `tickCount`.
2. Bei Tod + Freeze: UI-Update und Rückkehr.
3. `applySimulationDelta()`:
   - `applyStatusDrift()`
   - `applyActiveActionEffects()`
   - `advanceGrowthTick()`
   - `runEventStateMachine(nowMs)`
4. `runEventStateMachine()`:
   - verarbeitet `resolving/resolved/cooldown`
   - bei `idle` + Eventgrenze:
     - nachts: Deferral auf Tagesbeginn
     - tags: `activateEvent(nowMs)`
5. `activateEvent()`:
   - `eligibleEventsForNow()` (Phase/Trigger/Cooldowns)
   - optional `fallbackEventsForCurrentPhase()`
   - Resolver-Decision (`resolveFoundationCandidateEvent()`)
   - falls Resolver-Event in `eligible`: erzwungene Auswahl
   - sonst Legacy `selectEventDeterministically(pool, nowMs)`
6. Event wird als `activeEvent` gesetzt, Optionen vorbereitet, Memory-Eintrag geschrieben.

---

## 4) Automatisierte Event-Simulation (deterministisch)

## Durchgeführte Ausführung
- Neuer Helper: `dev/event_runtime_simulation.js`
- Output: `dev/event_runtime_stats.json`
- Seeds: `1, 42, 123, 999`
- Je Seed: `1000` Event-Ticks

### Kernergebnisse (aggregiert)
- Gesamt ausgelöste Events: **1531**
- Pool-Verteilung:
  - `warning`: 1038
  - `reward`: 396
  - `recovery`: 88
  - `rare`: 9
- Rare-Events: **9 (0,59%)**
- Ø Minuten zwischen Events: **63,82**
- Längste Chain: **1**
- Direkte Wiederholungen: **0**
- Follow-up Chains:
  - erzeugt: 51
  - konsumiert: 51
- Auswahlpfad:
  - Resolver-direkt: 55 (3,59%)
  - Legacy-gewichtet: 1476 (96,41%)

### Beobachtung pro Seed (Kurz)
- Seed 1 (indoor): 335 Events, rare 0
- Seed 42 (greenhouse): 403 Events, rare 5
- Seed 123 (outdoor): 425 Events, rare 4
- Seed 999 (indoor): 368 Events, rare 0

### Zusätzliche Verifikation
- `node dev/verify_event_pool_authoring.js`:
  - Runtime-Events: 38
  - Rare total: 3
  - Warnings zu fehlender `tone`/`category` und Rare-Phase-Skew.
- Tests:
  - `event-flow-*` und `event-resolver-guards-integration` bestanden.

---

## 5) Gameplay-Behavior-Analyse

### Event-Frequenz
Bei ~64 Minuten mittlerem Abstand wirkt das Event-Pacing im Grundsatz moderat, nicht spammy.

### Dominanzmuster
`warning`-Pool dominiert signifikant. In späten Phasen dominieren bestimmte IDs (z. B. `late_flower_humidity`, `v2_pest_thrips_wave`) stark.

### Rare-Reichweite
Rare ist erreichbar, aber in indoor Seeds praktisch null. Das ist plausibel wegen Trigger-/Setup-Bindung, aber für „spürbare“ Rare-Momente schwach.

### Follow-up-Zuverlässigkeit
Chains wurden vollständig konsumiert (51/51) -> technisch robust.

### Guard-Wirkung
Guard-Suppression war in der Resolver-Spur selten, weil Resolver-Kandidatenbasis klein ist. Das Problem ist nicht Guard-Fehler, sondern geringe Resolver-Abdeckung.

### Gameplay-Feel
- Positiv: deterministisch reproduzierbar, keine harten Repeat-Loops.
- Negativ: gefühlt wenig narrative Vielfalt im Mid/Late-Bereich durch dominante IDs und schwache Resolver-Durchsetzung.

---

## 6) Failure-Mode Detection (Findings)

### F1 — Resolver-Wirkung in Praxis sehr niedrig
- **Severity:** HIGH
- **Confidence:** hoch
- **Symptom:** 96,41% Selektionen laufen über Legacy-Gewichtung.
- **Root Cause:** Resolver liefert nur wenige harte Kandidaten; Aktivierung nutzt Resolver nur, wenn `decision.eventId` in `eligible` vorhanden ist, sonst Legacy-Pfad.
- **Dateien:** `events.js`, `src/events/eventResolver.js`
- **Impact:** Guard/Pool-Logik beeinflusst reale Auswahl deutlich weniger als erwartet.

### F2 — Pool-Verteilung stark warning-lastig
- **Severity:** MEDIUM
- **Confidence:** hoch
- **Symptom:** 1038/1531 Events aus `warning`.
- **Root Cause:** Kataloggewichtung + Triggerlage + Legacy-Dynamik bevorzugen Warning-/Stress-Muster.
- **Dateien:** `data/events*.json`, `events.js`
- **Impact:** Negativlastiges Eventgefühl, geringere narrative Bandbreite.

### F3 — Rare-Events funktional erreichbar, aber sehr selten
- **Severity:** MEDIUM
- **Confidence:** hoch
- **Symptom:** 0,59% rare insgesamt, indoor 0.
- **Root Cause:** wenige Rare-Definitionen + Setup-/Phasenbindung + Pool-Multiplier Rare=0,35.
- **Dateien:** `data/events.v2.json`, `src/events/eventResolver.js`
- **Impact:** „Special moments“ treten selten spürbar auf.

### F4 — Latenter Legacy-Bypass bei Modul-Ausfall
- **Severity:** MEDIUM
- **Confidence:** mittel
- **Symptom:** `app.js` enthält vollständige Legacy-Implementationen parallel zu Modul-APIs.
- **Root Cause:** Domain-Wiring mit Fallback auf Legacy (`wireDomainOwnership`), doppelte Funktionalität in `app.js`.
- **Dateien:** `app.js`, `events.js`, `sim.js`, `storage.js`
- **Impact:** Bei API-Fehlern kann Verhalten auf Legacy-Codepfad kippen (Regression-Risiko).

### F5 — Metadata-Qualität im Katalog inkonsistent
- **Severity:** MEDIUM
- **Confidence:** hoch
- **Symptom:** Lint meldet fehlende `tone`/`category`, ambige Pool-Inferenz.
- **Root Cause:** Teilweise unvollständige Authoring-Metadaten in v1/v2.
- **Dateien:** `data/events.json`, `data/events.v2.json`
- **Impact:** Pool-/Tone-basierte Steuerung wird unpräziser.

### F6 — Harness-Realitätslücke
- **Severity:** LOW
- **Confidence:** hoch
- **Symptom:** `dev/balance_harness.js` nutzt eigenes Modell; „careful“ erzeugt nur positive Events.
- **Root Cause:** Simulationsvereinfachung nutzt nicht den kompletten Live-Pfad.
- **Dateien:** `dev/balance_harness.js`
- **Impact:** Balancing-Aussagen aus Harness allein können Live-Verhalten verzerren.

---

## 7) System-Health Assessment

### Technische Bewertung
- **Gesamtstabilität:** gut
- **Event-Zuverlässigkeit:** gut (keine Crash-Muster, Chains stabil, Persistenztests grün)
- **Readiness für Content-Expansion:** mittel bis gut
- **Regressionsrisiko:** mittel (wegen Doppelpfaden/Ownership-Fallbacks)

### Klassifikation
**Stable foundation**  
Begründung: Kernsysteme laufen stabil und testbar, aber Resolver-zentrierte Architekturziele sind im Runtime-Verhalten noch nicht dominant genug.

---

## 8) Gameplay-Quality Assessment

### Stärken
- deterministische Reproduzierbarkeit
- sauberes Cooldown-/Repeat-Verhalten
- funktionierende Chain-Mechanik
- solide Event-Pacing-Grundlage

### Schwächen
- starke Warning-Dominanz
- geringe Rare-Sichtbarkeit
- Resolver-Mehrwert für Player-Experience noch begrenzt
- potenziell monotone Late-Phase-Ereignisse

### Replayability
Mittel: Seeds und Setup variieren Ergebnisse, aber Dominanz einzelner Events reduziert gefühlte Varianz.

---

## 9) Verbesserungsvorschläge

## A) Immediate bug fixes
1. **Resolver-Decision stärker in Aktivierung integrieren (ohne Redesign)**
   - Grund: aktueller Einfluss sehr niedrig.
   - Impact: bessere Wirksamkeit von Guards/Pools.
   - Risiko: mittel (Balanceverschiebung).
   - Priorität: **P0**

2. **Katalog-Metadatenlücken schließen (`tone`, `category`, `pool`)**
   - Grund: Inferenzfehler/Unschärfe.
   - Impact: stabilere Pool-Routings.
   - Risiko: niedrig.
   - Priorität: **P0**

## B) Structural hardening
1. **Ownership-Healthcheck beim Boot hart protokollieren**
   - Grund: latent doppelte Pfade.
   - Impact: schnellere Fehlerdiagnose.
   - Risiko: niedrig.
   - Priorität: **P1**

2. **Legacy-Shadow-Implementierungen dokumentieren/isolieren**
   - Grund: Regressionen bei Modul-Ausfall.
   - Impact: klarere Verantwortlichkeiten.
   - Risiko: niedrig bis mittel.
   - Priorität: **P1**

## C) Gameplay improvements
1. **Warning-Spikes glätten (Gewichte/Cooldowns)**
   - Grund: Warning dominiert.
   - Impact: ausgewogenere Dramaturgie.
   - Risiko: mittel.
   - Priorität: **P1**

2. **Rare-Sichtbarkeit leicht erhöhen (gezielt, nicht inflationär)**
   - Grund: nur 0,59%.
   - Impact: mehr „special moments“.
   - Risiko: niedrig bis mittel.
   - Priorität: **P1**

## D) Event catalog improvements
1. **Dominante IDs in Late-Phase aufsplitten oder Trigger enger fassen**
   - Grund: Monotonie-Risiko.
   - Impact: mehr Varianz pro Run.
   - Risiko: mittel.
   - Priorität: **P2**

2. **Phase-Abdeckung pro Pool regelmäßig linten**
   - Grund: Density-Skew.
   - Impact: bessere Verteilung.
   - Risiko: niedrig.
   - Priorität: **P2**

## E) Simulation/testing improvements
1. **Runtime-naher Event-Harness als Standard-QA-Lauf etablieren**
   - Grund: bestehender Harness ist teils modellbasiert.
   - Impact: realistischere Balanceaussagen.
   - Risiko: niedrig.
   - Priorität: **P1**

2. **Metrik-Gates (z. B. resolver_share, rare_share, top-event dominance)**
   - Grund: Regression-Früherkennung.
   - Impact: stabilere Iterationen.
   - Risiko: niedrig.
   - Priorität: **P2**

---

## 10) Priorisierte Roadmap

### P0 – Critical fixes
1. Resolver-Effektivität erhöhen (Aktivierungspfad enger an Resolver-Outcome binden).
2. Metadata-Vervollständigung (`tone`, `category`, explizite Pools für ambige Events).

### P1 – High-value improvements
1. Runtime-nahen Simulationslauf (`dev/event_runtime_simulation.js`) in Standard-QA aufnehmen.
2. Warning-Dominanz durch gezielte Gewicht-/Cooldown-Anpassungen reduzieren.
3. Ownership/Domain-Healthchecks erweitern.

### P2 – Structural improvements
1. Dominante Late-Phase-Events aufbrechen.
2. Pool- und Phasen-Verteilungsgates in CI/Pre-merge.

### P3 – Long-term evolution
1. Schrittweise Reduktion von Legacy-Doppelpfaden.
2. Ausbau narrativer Chains (kontrolliert) für höhere Run-Varianz.

---

## Artefakte / Outputs
- Simulation: `dev/event_runtime_simulation.js`
- Statistik: `dev/event_runtime_stats.json`
- Dieser Bericht: `docs/FULL_EVENT_SYSTEM_RUNTIME_ANALYSIS.md`

