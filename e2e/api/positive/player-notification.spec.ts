// @scenarios P22
import { test, expect } from '@playwright/test';
import { sendNotification, getPlayerNotifications } from '../../shared/api-client';
import { loadRunContext } from '../../shared/run-context';
import { getOperatorToken, getPlayerToken } from '../../shared/auth';

test.describe('player notifications', () => {
  test.describe.configure({ mode: 'serial' });

  let operatorToken: string;
  let playerToken: string;
  let gameId: string;
  let uniqueMessage: string;

  test.beforeAll(async () => {
    const ctx = loadRunContext();
    gameId = ctx.mainGameId;
    operatorToken = getOperatorToken();
    playerToken = getPlayerToken();
    uniqueMessage = `E2E P22 notification ${Date.now()}`;
  });

  // P22
  test('player receives notification sent by operator', async () => {
    // Operator sends notification
    const sendRes = await sendNotification(operatorToken, gameId, {
      message: uniqueMessage,
    });
    expect(sendRes.status).toBe(201);

    // Player retrieves their notifications
    const { status, data } = await getPlayerNotifications(playerToken);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);

    const found = data.some(
      (n: any) =>
        n.message === uniqueMessage ||
        n.body === uniqueMessage ||
        n.text === uniqueMessage,
    );
    expect(found).toBe(true);
  });
});
