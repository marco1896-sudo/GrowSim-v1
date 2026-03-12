# Pflanzen-Assets: Integration auf `plant_growth`

## Ersetzte alte Assets
- Alte Laufzeit-Referenzen auf `assets/plant/*` wurden durch das neue Sprite/Metadata-System ersetzt.
- Alte Einzelbild-Assets wurden aus dem aktiven Laufzeitpfad entfernt und nach `assets/legacy/plant_legacy/` verschoben.

## Angepasste Dateien
- `index.html`
- `app.js`
- `storage.js`
- `ui.js`
- `styles.css`
- `sw.js`
- `test/event-flow-persistence.test.js`
- `test/event-flow-multi-chain-persistence.test.js`
- `test/offline-cap.test.js`

## Neue Renderlogik
- Source of Truth:
  - `assets/plant_growth/plant_growth_sprite.png`
  - `assets/plant_growth/plant_growth_metadata.json`
- Das Pflanzen-Element wurde von `<img>` auf `<canvas id="plantImage">` umgestellt.
- `app.js` lädt Sprite + Metadata einmalig beim Boot (`loadPlantSpriteRuntime`).
- Das Rendering erfolgt über `renderPlantFromSprite(...)`:
  - Frame-Bereich im Sprite wird anhand von `frameWidth/frameHeight/columns` berechnet.
  - Auswahl über `getPlantFrameIndex(...)` und Stage-Mapping.
- Stage-Mapping auf neue Bereiche:
  - `1-3 seed`
  - `4-7 sprout`
  - `8-10 seedling`
  - `11-27 vegetative`
  - `28-31 preflower`
  - `32-38 flowering`
  - `39-43 late_flowering`
  - `44-46 harvest`

## Kompatibilität
- Savegame-kompatibel:
  - Alte `stageKey`-Werte bleiben erhalten (`stage_01` … `stage_12`).
  - Laufzeit mappt diese auf neue Sprite-Stages/Frames.
- `state.plant.assets.basePath` wurde auf `assets/plant_growth/` umgestellt.
- `resolvedStagePath` zeigt jetzt auf Sprite + Frame-Fragment.

## Legacy-Status
- Aktive Runtime nutzt nur noch `plant_growth`.
- Legacy-Assets liegen separat in `assets/legacy/plant_legacy/`.
- Keine aktiven Code-Referenzen auf `assets/plant/` mehr vorhanden.
