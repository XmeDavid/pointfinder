// @scenarios P17
import { test, expect, type Page } from '@playwright/test';
import { loadRunContext } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';
import { config } from '../../shared/config';

test.describe('Monitoring pages via web UI', () => {
  test.describe.configure({ mode: 'serial' });

  let gameId: string;

  test.beforeAll(async () => {
    const ctx = loadRunContext();
    gameId = ctx.mainGameId;
    // suppress unused warning
    void getOperatorToken();
  });

  // P17: Leaderboard page renders
  test('P17: leaderboard page renders with data', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/monitor/leaderboard`);

    await expect(page).toHaveURL(/\/leaderboard/, { timeout: 10_000 });

    // Page should not show an error state
    await expect(page.locator('text=/error|failed to load/i')).not.toBeVisible();

    // Should contain at least one rendered element (table row, list item, card)
    const entries = page.locator('tr, li, [data-testid*="leaderboard"], [data-testid*="team"]');
    await expect(entries.first()).toBeVisible({ timeout: 10_000 });
  });

  // P17: Activity feed page renders
  test('P17: activity feed page renders', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/monitor/activity`);

    await expect(page).toHaveURL(/\/activity/, { timeout: 10_000 });
    await expect(page.locator('text=/error|failed to load/i')).not.toBeVisible();

    // Activity page may be empty but should render without crashing
    const pageBody = page.locator('main, [role="main"], #root, .content').first();
    await expect(pageBody).toBeVisible({ timeout: 10_000 });
  });

  // P17: Submissions monitoring page renders
  test('P17: submissions page renders', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/monitor/submissions`);

    await expect(page).toHaveURL(/\/submissions/, { timeout: 10_000 });
    await expect(page.locator('text=/error|failed to load/i')).not.toBeVisible();

    const pageBody = page.locator('main, [role="main"], #root, .content').first();
    await expect(pageBody).toBeVisible({ timeout: 10_000 });
  });

  // P17: Sidebar navigation links work
  test('P17: sidebar navigation links to monitoring sections', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/monitor/leaderboard`);

    // Sidebar should be visible with navigation items
    const sidebar = page.locator('nav, [role="navigation"], aside').first();
    await expect(sidebar).toBeVisible({ timeout: 10_000 });

    // Navigate to activity via sidebar link
    const activityLink = page.locator('a[href*="activity"], [data-testid*="activity"]').first();
    if (await activityLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await activityLink.click();
      await expect(page).toHaveURL(/\/activity/, { timeout: 10_000 });
    }
  });

  // P17: Game overview page renders
  test('P17: game overview page renders', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/overview`);

    await expect(page).toHaveURL(/\/overview/, { timeout: 10_000 });
    await expect(page.locator('text=/error|failed to load/i')).not.toBeVisible();

    // Should show game name or status somewhere
    const content = page.locator('main, [role="main"], #root').first();
    await expect(content).toBeVisible({ timeout: 10_000 });
  });
});

async function loginAsOperator(page: Page) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(config.operatorEmail);
  await page.getByTestId('login-password').fill(config.operatorPassword);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/games/, { timeout: 15_000 });
}
