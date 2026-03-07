# Asset Pipeline Overview

## Zielbild
Professioneller, wiederholbarer Produktionsprozess für realistische, mobile-optimierte Spielassets.

## Pipeline-Stufen
1. **Planning**: Asset-Bedarf und Zielstil festlegen
2. **Prompting**: Vorlage aus `02_Prompts` anpassen
3. **Generation**: Primär über `ai-image-generation` Skill
4. **Post-Processing**: Hintergrund entfernen, PNG cleanup, ggf. Upscale
5. **Variation**: Zustände/Schadensbilder/Alternativen erzeugen
6. **Optimization**: Mobile Size, Kompression, Transparenzprüfung
7. **QA**: visuelle Konsistenz + technische Regeln
8. **Manifest**: Eintrag in `04_Output/manifests/assets_manifest.json`
9. **Export**: Kopie in `10_GitHub_Export`

## Design-Prinzipien
- Realistisch, nicht cartoonhaft
- Saubere Freistellung bei PNG
- Einheitlicher Licht-/Farbcharakter pro Theme
- Performance-first für Mobile
