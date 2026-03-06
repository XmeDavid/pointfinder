// @scenarios P17
import { test, expect } from '@playwright/test';
import {
  getDashboard,
  getLeaderboard,
  getActivity,
  getMonitoringProgress,
} from '../../shared/api-client';
import { loadRunContext } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';

test.describe('monitoring', { tag: '@smoke' }, () => {
  let gameId: string;
  let operatorToken: string;

  test.beforeAll(async () => {
    const ctx = loadRunContext();
    gameId = ctx.mainGameId;
    operatorToken = getOperatorToken();
  });

  test('get dashboard', async () => {
    const { status, data } = await getDashboard(operatorToken, gameId);
    expect(status).toBe(200);
    expect(data).toHaveProperty('totalTeams');
    expect(data).toHaveProperty('totalBases');
    expect(data).toHaveProperty('totalChallenges');
  });

  test('get leaderboard', async () => {
    const { status, data } = await getLeaderboard(operatorToken, gameId);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  test('get activity', async () => {
    const { status, data } = await getActivity(operatorToken, gameId);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  test('get progress', async () => {
    const { status, data } = await getMonitoringProgress(operatorToken, gameId);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });
});
