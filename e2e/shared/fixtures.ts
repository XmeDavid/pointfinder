export function gameFixture(runId: string) {
  return {
    name: `E2E ${runId} Main`,
    description: `E2E main game fixture for run ${runId}`,
  };
}

export function throwawayGameFixture(runId: string, label: string) {
  return {
    name: `E2E ${runId} ${label}`,
    description: `E2E throwaway game: ${label}`,
  };
}

export function baseFixture(index: number) {
  // Spread bases around Lisbon area
  const coords = [
    { lat: 38.7223, lng: -9.1393 },
    { lat: 38.7250, lng: -9.1500 },
    { lat: 38.7180, lng: -9.1320 },
    { lat: 38.7300, lng: -9.1450 },
    { lat: 38.7150, lng: -9.1550 },
  ];
  const c = coords[index % coords.length];
  return {
    name: `Base ${index}`,
    description: `E2E test base ${index}`,
    lat: c.lat,
    lng: c.lng,
  };
}

export function challengeFixture(answerType: 'text' | 'file', index?: number) {
  const configs: Record<string, { title: string; points: number; correctAnswer?: string[] }> = {
    text: { title: 'Challenge Text', points: 10, correctAnswer: ['correct'] },
    file: { title: 'Challenge File', points: 20 },
  };
  const cfg = configs[answerType];
  const suffix = index !== undefined ? ` ${index}` : '';
  return {
    title: `${cfg.title}${suffix}`,
    description: `E2E ${answerType} challenge${suffix}`,
    answerType,
    points: cfg.points,
    ...(cfg.correctAnswer ? { correctAnswer: cfg.correctAnswer } : {}),
  };
}

export function teamFixture(index: number) {
  const colors = ['#FF5733', '#33FF57', '#3357FF', '#FF33F5'];
  return {
    name: `Team ${index}`,
    color: colors[index % colors.length],
  };
}
