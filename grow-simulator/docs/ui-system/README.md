# UI‑System Phase 1

Dieses Verzeichnis dokumentiert die im Projekt verwendeten Design‑Tokens und
Basis‑Komponenten. Das Ziel des UI‑Systems ist es, einen konsistenten Dark‑HUD‑Look
mit klaren Layout‑ und Typografie‑Richtlinien zu gewährleisten.

## Design‑Tokens

Die Datei `../css/ui-tokens.css` definiert zentrale Farb‑, Abstands‑ und
Typografie‑Variablen, die im gesamten Projekt verwendet werden. Sie können
diese Datei bei der Erweiterung der Anwendung importieren, um neue
Komponenten zu gestalten. Beispiele für Tokens:

- `--color-primary`: Hauptfarbe (grün) für Gesundheit und positive Werte.
- `--color-accent`: Akzentfarbe (blau) für Wachstum.
- `--color-danger`: Warnfarbe (rot) für negative Aktionen.
- `--spacing-md`: Standardabstand für Blöcke.
- `--radius`: Einheitsradius für abgerundete Ecken.

## Komponenten

Die folgenden UI‑Elemente stehen in `css/styles.css` zur Verfügung und
sollten für die Gestaltung verwendet werden:

- **Card (`.card`)**: Container mit abgerundeten Ecken und Schatten für
  inhaltliche Blöcke.
- **Gauge (`.gauge`)**: Kreisförmige Fortschrittsanzeige mit Innenbeschriftung.
- **Statistik‑Balken (`.stat-bar`, `.stat-fill`)**: Horizontale Leiste zur
  Visualisierung von Werten wie Wasser oder Nährstoffen.
- **Buttons (`.btn`)**: Allgemeine Buttons mit Varianten `.primary`,
  `.danger` und `.info` für verschiedene Aktionen.
- **Modals (`.modal`)**: Vollbild‑Overlays zur Darstellung von Events oder
  Analyse‑Informationen.

Neue Komponenten sollten sich an diesen Basiselementen orientieren und die
Tokens aus `ui-tokens.css` verwenden.