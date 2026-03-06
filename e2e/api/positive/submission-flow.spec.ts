// @scenarios P10, P11, P12
import { test, expect } from '@playwright/test';
import {
  playerCheckIn,
  submitAnswer,
  reviewSubmission,
  getLeaderboard,
} from '../../shared/api-client';
import { loadRunContext } from '../../shared/run-context';
import { getOperatorToken, getPlayerToken } from '../../shared/auth';

test.describe('submission flow', { tag: '@smoke' }, () => {
  test.describe.configure({ mode: 'serial' });

  let gameId: string;
  let baseIds: string[];
  let challengeIds: string[];
  let teamIds: string[];
  let operatorToken: string;
  let playerToken: string;
  let submissionId: string;

  test.beforeAll(async () => {
    const ctx = loadRunContext();
    gameId = ctx.mainGameId;
    baseIds = ctx.baseIds;
    challengeIds = ctx.challengeIds;
    teamIds = ctx.teamIds;
    operatorToken = getOperatorToken();
    playerToken = getPlayerToken();
  });

  // P10
  test('player submits text answer', async () => {
    const checkIn = await playerCheckIn(playerToken, gameId, baseIds[0]);
    expect(checkIn.status).toBe(200);

    const { status, data } = await submitAnswer(playerToken, gameId, {
      baseId: baseIds[0],
      challengeId: challengeIds[0],
      answer: 'correct',
    });
    expect(status).toBe(201);
    expect(data).toHaveProperty('id');
    submissionId = data.id;
  });

  // P11
  test('operator reviews submission', async () => {
    const { status, data } = await reviewSubmission(operatorToken, gameId, submissionId, {
      status: 'approved',
      feedback: 'Well done',
      points: 10,
    });
    expect(status).toBe(200);
    expect(data.status).toBe('approved');
  });

  // P12
  test('leaderboard updates after review', async () => {
    const { status, data } = await getLeaderboard(operatorToken, gameId);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);

    const teamEntry = data.find((entry: any) => entry.teamId === teamIds[0] || entry.team?.id === teamIds[0]);
    expect(teamEntry).toBeDefined();
    const points = teamEntry.points ?? teamEntry.totalPoints ?? teamEntry.score ?? 0;
    expect(points).toBeGreaterThanOrEqual(10);
  });
});
