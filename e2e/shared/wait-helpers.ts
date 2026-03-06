import * as api from './api-client';

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
  token: string,
  gameId: string,
  teamId: string,
  expectedMinPoints: number,
): Promise<void> {
  await waitForCondition(async () => {
    const { data } = await api.getLeaderboard(token, gameId);
    if (!Array.isArray(data)) return false;
    const team = data.find((e: any) => e.teamId === teamId || e.team?.id === teamId);
    const points = team?.points ?? team?.totalPoints ?? team?.score ?? 0;
    return points >= expectedMinPoints;
  });
}

export async function waitForSubmissionStatus(
  token: string,
  gameId: string,
  submissionId: string,
  expectedStatus: string,
): Promise<void> {
  await waitForCondition(async () => {
    const { data } = await api.getSubmissions(token, gameId);
    if (!Array.isArray(data)) return false;
    const sub = data.find((s: any) => s.id === submissionId);
    return sub && sub.status === expectedStatus;
  });
}

export async function waitForActivityEvent(
  token: string,
  gameId: string,
  eventType: string,
): Promise<void> {
  await waitForCondition(async () => {
    const { data } = await api.getActivity(token, gameId);
    if (!Array.isArray(data)) return false;
    return data.some((e: any) => e.type === eventType);
  });
}
