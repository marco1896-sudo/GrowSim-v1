# EVENT_SYSTEM_PLAN

## Ist-Zustand

- **Runtime-Engine:** `app.js` enthält ein funktionierendes Event-State-Machine-Grundgerüst (`idle -> activeEvent -> resolved -> cooldown`).
- **Datenquellen:**
  - `data/events.json` (Legacy/v1, viele Events ohne saubere Triggerlogik)
  - `data/events.v2.json` (bereits triggerbasiert, stage/setup/all/any vorhanden)
- **Auswahlmechanik:** deterministische Auswahl per Seed/Hash, Basis-Weighting vorhanden.
- **Anti-Spam (aktuell):**
  - globales Event-Cooldown
  - per-Event-Cooldown
  - keine Nacht-Events
  - rudimentäre Category-Varianz (letzte Kategorie wird möglichst vermieden)
- **Lücken/Risiken:**
  - kein explizites **Polarity-Balancing** (negativ/positiv)
  - Outdoor-Events vorhanden, aber noch zu dünn und nicht als eigener Systemzweig dokumentiert
  - Triggerauflösung kennt `setup.mode`, aber keine explizite Event-Umgebungs-Semantik
  - Balance-Harness spiegelt nicht alle Runtime-Regeln wider

## Zielstruktur

1. **Datengetriebenes Event-System (v2-first)**
   - Events primär aus `events.v2.json`
   - Legacy bleibt kompatibel, aber neue Inhalte nur v2
2. **Klare Event-Metadaten**
   - Stage, Setup/Environment, Severity, Cooldown, Learning Note
   - neue optionale Meta-Felder für Balancing (z. B. polarity/tags)
3. **Deterministische, nachvollziehbare Auswahl**
   - bestehendes deterministic picking beibehalten
   - ergänzend stage-/state-bezogene Gewichtsmodulation
4. **Stabilität zuerst**
   - keine Breaking Changes an Saves
   - keine invasive UI-Neuarchitektur
5. **Testbarkeit erhöhen**
   - Runtime-Selbsttest + Balance-Harness synchronisieren
   - reproduzierbare Checkliste für manuelle Tests

## Event-Kategorien

- **water** (Trockenstress, Staunässe, Feuchteschwankungen)
- **nutrition** (Mangel-/Überschuss-/Aufnahmeprobleme, konservativ formuliert)
- **environment** (Hitze/Kälte/Feuchte/Wetter)
- **pest** (Schädlingsverdacht, nicht überdiagnostisch)
- **disease** (Schimmel-/Wurzelrisiko)
- **positive** (stabile/ideale Phase, Erholung, Wetterfenster)
- **special** (selten, aber plausibel: Wetterumschwung, kurze Extremphase)

## Stage-Zuordnung

- **germination / seedling (1-2):** Feuchte, Temperatur, milde Stressoren
- **early/veg (3-5):** Wasser-/Nährstoff-/Wachstumsstress, erste Schädlingshinweise
- **preflower/stretch (6-7):** Klima-/Licht-/Nährstoffbalance, Stressmanagement
- **flower/late flower (8-10):** Feuchte-/Schimmel-/Wetterrisiken, konservative Bud-Rot-Risiko-Logik outdoor
- **ripening/harvest (11-12):** Spätphasenrisiken, weniger harte Eingriffe, Stabilität

## Geplante Wahrscheinlichkeitslogik

1. **Eligibility-Filter:**
   - Stage + Triggerbedingungen + Setup-Mode + Cooldowns
2. **Gewichtete Auswahl:**
   - Basis `weight`
   - leichte Modulation nach Status (z. B. hohes Risiko => risk-nahe Events wahrscheinlicher)
3. **Anti-Spam:**
   - global cooldown + per-event cooldown (bestehend)
   - zusätzlich Category-Wechselpräferenz
4. **Polarity-Balance:**
   - nach negativen Eventketten höhere Chance auf neutral/positiv
   - keine garantiert positive Kette, nur sanfte Korrektur
5. **Outdoor-Logik:**
   - Outdoor-Events nur bei `setup.mode = outdoor`/`greenhouse`
   - Indoor-spezifische Events bei `indoor` priorisieren

## Testplan

1. **Stabilität/Basis**
   - `node --check app.js`
   - App-Start im Browser prüfen
2. **Event-System funktional**
   - Events triggern bei passenden Stage/Status
   - falsche Stage-Events treten nicht auf
   - Cooldowns greifen
3. **Balancing**
   - `node dev/balance_harness.js --runs 20 --strategy careful --seed <x>`
   - dito `aggressive`, `neglect`
   - Vergleich Events/Run, Stress-/Health-Mittel
4. **Outdoor-Spezifika**
   - setup.mode auf outdoor/greenhouse: Outdoor-Events sichtbar
   - indoor: Outdoor-Events nicht sichtbar
5. **Persistenz/Reload**
   - Reload während aktivem Event
   - Reload in Cooldown
   - Save-State bleibt konsistent
6. **Regression**
   - Aktionen weiterhin ausführbar
   - Stage-Fortschritt, Overlays, Analyse-Timeline intakt
