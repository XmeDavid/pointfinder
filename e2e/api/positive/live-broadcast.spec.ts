// @scenarios P19
import { test, expect } from '@playwright/test';
import { getBroadcast, getBroadcastLeaderboard, updateGame, getGame } from '../../shared/api-client';
import { loadRunContext } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';

test.describe('Live Broadcast - positive', () => {
  test.describe.configure({ mode: 'serial' });

  let token: string;
  let mainGameId: string;
  let broadcastCode: string;

  test.beforeAll(async () => {
    const ctx = loadRunContext();
    mainGameId = ctx.mainGameId;
    token = getOperatorToken();

    if (ctx.broadcastCode) {
      broadcastCode = ctx.broadcastCode;
    } else {
      // Get current game to include name in update (name is required)
      const gameRes = await getGame(token, mainGameId);
      expect(gameRes.status).toBe(200);

      const updateRes = await updateGame(token, mainGameId, {
        name: gameRes.data.name,
        broadcastEnabled: true,
      });
      expect(updateRes.status).toBe(200);

      const refreshed = await getGame(token, mainGameId);
      expect(refreshed.status).toBe(200);
      broadcastCode = refreshed.data.broadcastCode;
    }

    expect(typeof broadcastCode).toBe('string');
    expect(broadcastCode.length).toBeGreaterThan(0);
  });

  test('P19: get broadcast data', async () => {
    const { status, data } = await getBroadcast(broadcastCode);
    expect(status).toBe(200);
    expect(data).toBeDefined();
  });

  test('P19: get broadcast leaderboard', async () => {
    const { status, data } = await getBroadcastLeaderboard(broadcastCode);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });
});
