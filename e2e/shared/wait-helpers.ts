export async function waitForCondition(
  fn: () => Promise<boolean>,
  opts: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const timeout = opts.timeout ?? 15_000;
  const interval = opts.interval ?? 1_000;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`waitForCondition timed out after ${timeout}ms`);
}

export async function waitForLeaderboardUpdate(
  apiClient: { getLeaderboard: (gameId: string) => Promise<any[]> },
  gameId: string,
  teamId: string,
  expectedMinPoints: number,
): Promise<void> {
  await waitForCondition(async () => {
    const entries = await apiClient.getLeaderboard(gameId);
    const team = entries.find((e: any) => e.teamId === teamId);
    return team && team.points >= expectedMinPoints;
  });
}

export async function waitForSubmissionStatus(
  apiClient: { getSubmissions: (gameId: string) => Promise<any[]> },
  gameId: string,
  submissionId: string,
  expectedStatus: string,
): Promise<void> {
  await waitForCondition(async () => {
    const subs = await apiClient.getSubmissions(gameId);
    const sub = subs.find((s: any) => s.id === submissionId);
    return sub && sub.status === expectedStatus;
  });
}

export async function waitForActivityEvent(
  apiClient: { getActivity: (gameId: string) => Promise<any[]> },
  gameId: string,
  eventType: string,
): Promise<void> {
  await waitForCondition(async () => {
    const events = await apiClient.getActivity(gameId);
    return events.some((e: any) => e.type === eventType);
  });
}
