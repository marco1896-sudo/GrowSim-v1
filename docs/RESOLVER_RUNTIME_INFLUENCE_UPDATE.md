# Resolver Runtime Influence Update

## Kurzfassung
Der Resolver war im Runtime-Pfad vorhanden, hat aber faktisch selten die finale Event-Auswahl beeinflusst. Hauptgrund war, dass der Resolver ohne den aktuellen Eligible-Pool arbeitete und nur wenige interne Kandidaten (z. B. `stable_growth_reward`, `drooping_leaves_warning`) erzeugte. Dadurch fiel die Auswahl in der Praxis fast immer auf den Legacy-Weighted-Fallback zurück.

In diesem Update wurde **kein System redesign** durchgeführt. Stattdessen wurde die bestehende Aktivierungskette so erweitert, dass der Resolver den Kandidatenraum vor der Legacy-Auswahl mitprägen kann und zusätzlich in einem deterministisch begrenzten Anteil direkte Picks setzen darf.

## Ausgangslage (vorher)
Quelle: `dev/event_runtime_stats.before_resolver_update.json`

- Total events: 1531
- Resolver direct selections: 55 (3,59 %)
- Legacy fallback selections: 1476 (96,41 %)
- Pool-Verteilung:
  - warning: 1038
  - reward: 396
  - recovery: 88
  - rare: 9
- Rare-Anteil: 0,59 %
- Follow-up chains: 51 ausgelöst / 51 konsumiert

## Warum der Resolver kaum Einfluss hatte
1. `events.js` nutzte Resolver-Ausgabe primär als **harten Forced-Pick** (`eventId` muss exakt im Eligible-Pool sein).
2. Resolver-Kandidaten wurden intern eng erzeugt und nicht aus dem Laufzeit-Eligible-Pool gespeist.
3. Wenn kein Forced-Pick griff, lief direkt `selectEventDeterministically(...)` auf dem Legacy-Pool.
4. Ergebnis: Resolver aktiv, aber praktisch selten entscheidend.

## Implementierte Strategie (sicher, minimal)

### 1) Resolver erhält den aktuellen Eligible-Kandidatenraum
- `resolveNextEventWithTrace(...)` akzeptiert jetzt optional `sourceCandidates`.
- Wenn vorhanden, nutzt der Resolver diese Kandidaten als Input für Guard- und Pool-Logik.
- Fallback auf bestehende interne Kandidaten bleibt erhalten.

### 2) Resolver prägt Kandidatenraum vor Legacy-Weighted-Selection
- In `events.js` wird pro Aktivierung ein Resolver-Trace über den aktuellen Eligible-Pool gebildet.
- Bei erlaubtem Einfluss wird aus dem Trace ein **resolver-shaped subset** erzeugt.
- Legacy-Weighted-Selection läuft dann auf diesem Subset (oder fallback auf gesamten Pool).

### 3) Deterministisch begrenzte Resolver-Durchsetzung
- Direkte Resolver-Picks bleiben vorhanden, aber nur mit deterministischer Gate-Rate.
- Zusätzlich wird das Shaping ebenfalls deterministisch und limitiert aktiviert.
- Pending-Chain/Flag-Overrides behalten Vorrang.

### 4) Pending/Flag-Override nur wenn Ziel im Kandidatenraum liegt
- Resolver-Overrides für Pending/Flag greifen nur, wenn das Ziel im aktuellen `sourceCandidates`-Set liegt (oder keine SourceCandidates gegeben sind).
- Verhindert unproduktive Override-Signale auf nicht aktivierbare Ziele.

## Geänderte Dateien

### `src/events/eventResolver.js`
- `resolveNextEventWithTrace(...)` erweitert um `sourceCandidates`.
- Externe Kandidaten normalisiert und in bestehende Guard/Pool-Pipeline integriert.
- Pending-/Flag-Override auf Kandidatenraum-Eligibility abgesichert.

### `events.js`
- Neue Integrationslogik für `resolveFoundationDecisionForPool(pool, nowMs)` mit `resolveNextEventWithTrace(...)`.
- Deterministische Influence-Gates eingeführt:
  - `RESOLVER_DIRECT_INFLUENCE_RATE = 0.12`
  - `RESOLVER_SHAPED_POOL_INFLUENCE_RATE = 0.10`
- Resolver-shaped subset vor Legacy-Selection eingebaut.
- Legacy-Fallback vollständig erhalten.

### `dev/event_runtime_simulation.js`
- Simulator auf denselben Aktivierungspfad gebracht (`sourceCandidates`, Direct/Shape-Gates).
- Resolver-Aufruf nur bei vorhandenem Eligible-Pool (runtime-näher).
- Neue Kennzahl `resolverInfluence` ergänzt.

## Messung nach Update
Quelle: `dev/event_runtime_stats.json`

- Total events: 1465
- Resolver direct selections: 218
- Resolver-shaped legacy selections: 133
- Resolver-driven gesamt: 351 (23,96 %)
- Legacy fallback selections: 1247
- Pool-Verteilung:
  - warning: 1012
  - reward: 372
  - recovery: 73
  - rare: 8
- Rare-Anteil: 0,55 %
- Follow-up chains: 46 ausgelöst / 46 konsumiert

## Vorher/Nachher (Kernwerte)

- Resolver-Einfluss (gesamt):
  - vorher: 3,59 % (nur direct-forced gemessen)
  - nachher: 23,96 % (direct + shaped)
- Legacy-Dominanz:
  - vorher: 96,41 %
  - nachher: deutlich reduziert
- Follow-up-Stabilität:
  - unverändert stabil (ausgelöst = konsumiert)

## Kompatibilitätsgarantien

- Guard-Pipeline bleibt aktiv und unverändert im Resolver.
- Pending-Chain-Vorrang bleibt erhalten.
- Legacy-Fallback bleibt vollständig erhalten.
- Determinismus bleibt erhalten (alle neuen Gates deterministisch über bestehende Hash-Mechanik).
- Keine UI-Änderungen.
- Keine Änderung an Persistenzformaten.

## Validierung
Folgende Prüfungen liefen erfolgreich:

- `node --check src/events/eventResolver.js`
- `node --check events.js`
- `node --check dev/event_runtime_simulation.js`
- `node test/event-resolver-guards-integration.test.js`
- `node test/event-flow-integration.test.js`
- `node test/event-flow-persistence.test.js`
- `node test/event-flow-multi-chain-persistence.test.js`
- `node dev/run_resolver_replay.js`
- `node dev/verify_event_pools.js`
- `node dev/verify_event_weighting.js`
- `node dev/verify_event_pool_authoring.js`

## Verbleibende Limitationen

- Warning-Pool dominiert weiterhin stark (katalogbedingt).
- Rare-Anteil bleibt niedrig; die 1-3 %-Zielspanne wird aktuell nicht zuverlässig erreicht.
- Nächster sinnvoller Schritt ist daher **Content-Tuning (Pool/Tone/Weights im Katalog)**, nicht weiterer Architekturumbau.
