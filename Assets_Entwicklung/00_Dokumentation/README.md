# Assets_Entwicklung

Zentrale Asset-Entwicklungsumgebung für ein mobiles Plant-/Grow-Simulation-Game.

## Zweck
Diese Umgebung trennt Asset-Entwicklung sauber vom Game-Code und bildet den kompletten Produktionspfad ab:
1. Generieren
2. Variieren
3. Bereinigen/Optimieren
4. QA/Review
5. Export für Mobile/HD
6. Übergabe an Repository

## Kernstruktur
- `00_Dokumentation`: Architektur, Status, Abschlussbericht
- `02_Prompts`: Prompt-Bibliothek nach Asset-Typ
- `04_Output`: erzeugte Assets + Exportformate + Manifest
- `05_Workflows`: Schritt-für-Schritt Pipelines
- `06_Skripte`: Batch-/Automationsvorlagen
- `07_Konfiguration`: Namensregeln, Qualitätsstandards, Exportregeln
- `08_Modelle_und_Skills`: installierte Skills + Platzhalter für nicht installierte Tools
- `10_GitHub_Export`: finaler Übergabeordner ins Hauptprojekt
- `11_Testing`: QA-Checklisten

## Asset-Typen
- Plants (Stages)
- Plant Variants (Stress/Deficiency)
- Event Illustrations
- UI Icons
- Backgrounds/Themes
- Animation Assets

## Pipeline (Kurz)
Prompt -> Generation -> Cleanup/Transparency -> Varianten -> Upscale -> Mobile-Optimierung -> QA -> Manifest-Update -> Export.

## Export ins Hauptprojekt
1. Assets in `10_GitHub_Export/assets/*` bereitstellen
2. Manifest in `10_GitHub_Export/manifests/` aktualisieren
3. Mit `05_Workflows/github_publish_workflow.md` in Ziel-Repo übernehmen
