// Analyse‑System: generiert Diagnose, Risiken und Empfehlungen basierend auf dem Zustand
export function getAnalysis(state) {
  const { water, nutrients, health, growth, stage } = state.plant;
  const issues = [];
  const risks = [];
  const recommendations = [];
  // Wasser
  if (water < 0.3) {
    issues.push('Niedriger Wasserstand');
    risks.push('Dehydration und Wachstumsstopp');
    recommendations.push('Pflanze zeitnah gießen');
  }
  // Nährstoffe
  if (nutrients < 0.3) {
    issues.push('Nährstoffmangel');
    risks.push('Schwaches Wachstum, Anfälligkeit für Krankheiten');
    recommendations.push('Düngen Sie die Pflanze');
  }
  // Gesundheit
  if (health < 0.5) {
    issues.push('Schlechte Gesundheit');
    risks.push('Hohes Sterberisiko');
    recommendations.push('Überprüfen Sie auf Schädlinge, Krankheiten oder nutzen Sie die Rettungs‑Ad');
  }
  // Blütephase
  if (growth > 0.8 && stage === 'flower') {
    issues.push('Blütephase');
    risks.push('Hoher Energiebedarf');
    recommendations.push('Achten Sie auf ausgewogene Versorgung');
  }
  if (issues.length === 0) {
    issues.push('Alles OK');
    risks.push('Keine akuten Risiken');
    recommendations.push('Weiter so!');
  }
  return {
    issues,
    risks,
    recommendations,
  };
}