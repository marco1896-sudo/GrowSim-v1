# DEATH_SCREEN_IMPLEMENTATION

## Ziel
Death-State UX auf klare Hauptaktionen priorisieren:
1. Rettungsaktion nutzen (1× pro Run)
2. Neuen Run starten
3. Analyse ansehen

## Umgesetzt
- Death-Overlay Buttons neu priorisiert und sichtbar gemacht:
  - `Rettungsaktion nutzen`
  - `Neuen Run starten`
  - `Analyse ansehen` (visuell nachrangig)
- Rettungsaktion-Subtext auf `1× pro Run` gesetzt.
- Nach Nutzung wird Rettungsaktion deaktiviert und als verbraucht angezeigt.
- Rettungslogik verbessert:
  - holt aus Death-State zurück
  - setzt auf kritischen, aber spielbaren Zustand
  - reduziert Stress/Risiko, hebt Wasser/Nährstoffe auf Mindestniveau
  - Quality-Score-Malus angewendet
- Death-Overlay schließt nach erfolgreicher Rettung, Simulation läuft weiter.
- `Neuen Run starten` aus Death-Overlay mit Confirm-Dialog abgesichert.
- Analyse-Funktion unverändert funktionsfähig.

## Betroffene Dateien
- `index.html`
- `app.js`

## Hinweise
- Rettungsaktion bleibt bewusst konservativ (kein Full-Heal).
- Rettung ist dauerhaft pro Run als verbraucht markiert und wird bei neuem Run zurückgesetzt.
