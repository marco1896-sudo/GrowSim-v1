function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function computeDifficultyFromTick({ tickIndex, tickSeconds, difficultyRampDays }) {
  const safeTickIndex = Number.isFinite(tickIndex) ? Math.max(0, tickIndex) : 0;
  const safeTickSeconds = Number.isFinite(tickSeconds) && tickSeconds > 0 ? tickSeconds : 60;
  const safeRampDays = Number.isFinite(difficultyRampDays) && difficultyRampDays > 0 ? difficultyRampDays : 21;

  const daysSinceStart = (safeTickIndex * safeTickSeconds) / 86400;
  const D = clamp(daysSinceStart / safeRampDays, 0, 1);

  return {
    daysSinceStart,
    D
  };
}
