# Optimization Workflow

## Goal
Kompression, Resizing und mobile Exportoptimierung.

## Inputs
- Prompt Vorlage aus `02_Prompts`
- Referenzstil aus `12_Referenzen`
- Konfigurationsregeln aus `07_Konfiguration`

## Tools / skills used
- ai-image-generation
- imagemagick
- (optional) video-generation
- (optional) background-removal / image-upscaling

## Step-by-step pipeline
1. Zielasset und Naming-Key festlegen
2. Prompt aus Vorlage befüllen
3. Erstgenerierung durchführen
4. Bestes Ergebnis auswählen
5. Cleanup/Optimierung anwenden
6. In Zielordner in `04_Output` ablegen
7. Manifest-Eintrag aktualisieren
8. QA mit Checklisten durchführen

## Quality checks
- Stil konsistent
- Technische Constraints erfüllt
- Mobile-Performance akzeptabel

## Output directories
- `04_Output/*`
- `10_GitHub_Export/assets/*`

## Possible failure points
- Inkonsistenter Stil über Serien
- Falsche Transparenzkanten
- Zu große Dateigröße für Mobile
- Fehlende Manifest-Einträge
