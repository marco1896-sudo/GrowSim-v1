# Skill Übersicht

## ai-image-generation
- Zweck: Hauptgenerator für Pflanzen, Events, Hintergründe, Icons
- Input: strukturierter Prompt (Purpose, Style, Composition, etc.)
- Output: PNG/JPG nach Modell
- Rolle: Primäre Erzeugung

## video-generation
- Zweck: kurze Motion-Loops/Transitions
- Input: Prompt + optionales Referenzbild
- Output: MP4/WebM, ggf. Frame-Extraktion
- Rolle: Animation-Assets

## imagemagick
- Zweck: Batch-Resize, Kompression, Formatkonvertierung, Alpha-Checks
- Input: lokale Dateien
- Output: optimierte PNG/WebP/JPG
- Rolle: Optimierung + Export

## background-removal (placeholder)
- Zweck: Freistellen von Motiven
- Status: Sicherheitsreview erforderlich
- Rolle: PNG transparency pipeline

## image-upscaling (placeholder)
- Zweck: Detailerhalt beim Hochskalieren
- Status: Sicherheitsreview erforderlich
- Rolle: HD-Export/Feindetails
