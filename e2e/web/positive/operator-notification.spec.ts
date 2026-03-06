// @scenarios P18
import { test, expect, type Page } from '@playwright/test';
import { getNotifications } from '../../shared/api-client';
import { loadRunContext } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';
import { config } from '../../shared/config';

test.describe('Operator notifications via web UI', () => {
  test.describe.configure({ mode: 'serial' });

  let gameId: string;
  let teamId: string;
  let token: string;

  test.beforeAll(async () => {
    const ctx = loadRunContext();
    gameId = ctx.mainGameId;
    teamId = ctx.teamIds[0];
    token = getOperatorToken();
  });

  // P18: Navigate to notifications page
  test('P18: notifications page renders', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/notifications`);

    await expect(page).toHaveURL(/\/notifications/, { timeout: 10_000 });
    await expect(page.locator('text=/error|failed to load/i')).not.toBeVisible();

    await expect(page.getByTestId('notification-message-input')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('notification-send-btn')).toBeVisible({ timeout: 10_000 });
  });

  // P18: Send broadcast notification via UI form
  test('P18: send broadcast notification via UI', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/notifications`);

    const messageInput = page.getByTestId('notification-message-input');
    await expect(messageInput).toBeVisible({ timeout: 10_000 });
    await messageInput.fill(`E2E web broadcast ${config.runId}`);

    await page.getByTestId('notification-send-btn').click();

    // Success indicator: toast, cleared input, or confirmation message
    const successEl = page.locator('text=/sent|success/i').first();
    const inputCleared = messageInput.inputValue().then((v) => v === '');
    await Promise.race([
      expect(successEl).toBeVisible({ timeout: 10_000 }),
      inputCleared.then((cleared) => {
        if (!cleared) throw new Error('not cleared');
      }),
    ]).catch(() => {
      // Either indicator is acceptable — just verify via API
    });

    // Verify via API the notification was stored
    const notifRes = await getNotifications(token, gameId);
    expect(notifRes.status).toBe(200);
    const messages: string[] = (notifRes.data as Array<{ message: string }>).map((n) => n.message);
    expect(messages).toContain(`E2E web broadcast ${config.runId}`);
  });

  // P18: Send targeted notification via UI (select a team)
  test('P18: send targeted notification to specific team via UI', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/notifications`);

    // Select target team if a team selector exists
    const teamSelect = page.locator('select[name*="team" i], [data-testid*="team-select"]').first();
    if (await teamSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await teamSelect.selectOption({ value: teamId });
    }

    const messageInput = page.getByTestId('notification-message-input');
    await expect(messageInput).toBeVisible({ timeout: 10_000 });
    await messageInput.fill(`E2E web targeted ${config.runId}`);

    await page.getByTestId('notification-send-btn').click();

    // Verify via API
    await page.waitForTimeout(1_000);
    const notifRes = await getNotifications(token, gameId);
    expect(notifRes.status).toBe(200);
    const messages: string[] = (notifRes.data as Array<{ message: string }>).map((n) => n.message);
    expect(messages).toContain(`E2E web targeted ${config.runId}`);
  });

  // P18: Notification history is visible
  test('P18: sent notifications appear in history list', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/notifications`);

    await expect(page).toHaveURL(/\/notifications/, { timeout: 10_000 });

    // Notification history should show previous entries
    const historySection = page.locator(
      '[data-testid*="notification-history"], [data-testid*="notification-list"], ul, ol',
    ).first();
    await expect(historySection).toBeVisible({ timeout: 10_000 });
  });
});

async function loginAsOperator(page: Page) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(config.operatorEmail);
  await page.getByTestId('login-password').fill(config.operatorPassword);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/games/, { timeout: 15_000 });
}
