# Installation Status

## Automatisch installiert
- `ai-image-generation` (bereits vorhanden)
- `video-generation` (installiert)
- `imagemagick` (installiert)

## Vorbereitung / Placeholder (nicht automatisch installiert)
- `background-removal` (ClawHub Sicherheitsflag; benötigt `--force` + Review)
- `image-upscaling` (ClawHub Sicherheitsflag; benötigt `--force` + Review)
- GitHub Export Skill (kein passender Standard-Skill gefunden; Workflow dokumentiert)
- Asset Catalog/Manifest Skill (kein passender Standard-Skill gefunden; lokales Manifest-System eingerichtet)

## Empfohlene manuelle Installation (nach Sicherheitsprüfung)
```bash
clawhub install background-removal --force
clawhub install image-upscaling --force
```

## Roh-Logs
- `08_Modelle_und_Skills/installation_raw.json`
