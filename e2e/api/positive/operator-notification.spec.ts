// @scenarios P18
import { test, expect } from '@playwright/test';
import { sendNotification, getNotifications } from '../../shared/api-client';
import { loadRunContext } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';

test.describe('Operator Notifications - positive', () => {
  test.describe.configure({ mode: 'serial' });

  let token: string;
  let mainGameId: string;
  let teamId: string;

  test.beforeAll(async () => {
    const ctx = loadRunContext();
    mainGameId = ctx.mainGameId;
    teamId = ctx.teamIds[0];
    token = getOperatorToken();
  });

  test('P18: send broadcast notification', async () => {
    const { status, data } = await sendNotification(token, mainGameId, {
      message: 'E2E test notification',
    });
    expect(status).toBe(201);
    expect(data).toBeDefined();
  });

  test('P18: send targeted notification', async () => {
    const { status, data } = await sendNotification(token, mainGameId, {
      message: 'E2E targeted',
      targetTeamId: teamId,
    });
    expect(status).toBe(201);
    expect(data).toBeDefined();
  });

  test('P18: list notifications includes sent notifications', async () => {
    const { status, data } = await getNotifications(token, mainGameId);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(2);

    const messages: string[] = data.map((n: { message: string }) => n.message);
    expect(messages).toContain('E2E test notification');
    expect(messages).toContain('E2E targeted');
  });
});
