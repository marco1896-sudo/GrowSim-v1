// Logik für die Pflanze
// Aktualisiert Wasser, Nährstoffe, Gesundheit und Wachstum anhand fester Raten

// Verbrauch pro Minute (Tick)
const CONSUMPTION = {
  water: 0.0015,
  nutrients: 0.0010,
};

export function updatePlant(state) {
  const plant = state.plant;
  // Grundverbrauch
  plant.water = Math.max(0, plant.water - CONSUMPTION.water);
  plant.nutrients = Math.max(0, plant.nutrients - CONSUMPTION.nutrients);
  // Gesundheit sinkt wenn Ressourcen niedrig
  if (plant.water < 0.3 || plant.nutrients < 0.3) {
    plant.health = Math.max(0, plant.health - 0.002);
  } else {
    // langsame Erholung der Gesundheit
    plant.health = Math.min(1, plant.health + 0.0005);
    // Wachstum nur bei guter Versorgung
    plant.growth = Math.min(1, plant.growth + 0.001);
  }
  // Stadium aktualisieren
  if (plant.growth >= 0.66) {
    plant.stage = 'flower';
  } else if (plant.growth >= 0.33) {
    plant.stage = 'veg';
  } else {
    plant.stage = 'seedling';
  }
  // Game Over wenn Gesundheit auf 0 fällt
  if (plant.health <= 0) {
    // reset state (neuer Keimling, Tag weiter)
    plant.health = 1;
    plant.water = 1;
    plant.nutrients = 1;
    plant.growth = 0;
    plant.stage = 'seedling';
    state.analysisUnlocked = false;
    // Ein Game‑Over könnte als Info dargestellt werden (Toast)
  }
}