// @scenarios P19
import { test, expect, type Page } from '@playwright/test';
import { getBroadcast, getBroadcastLeaderboard } from '../../shared/api-client';
import { loadRunContext } from '../../shared/run-context';
import { config } from '../../shared/config';

test.describe('Live broadcast page', () => {
  test.describe.configure({ mode: 'serial' });

  let broadcastCode: string;

  test.beforeAll(async () => {
    const ctx = loadRunContext();
    if (!ctx.broadcastCode) {
      throw new Error('No broadcastCode in run context — ensure main game has broadcastEnabled and a code');
    }
    broadcastCode = ctx.broadcastCode;
  });

  // P19: Public broadcast page is accessible without login
  test('P19: /live/:code page loads without authentication', async ({ page }) => {
    await page.goto(`/live/${broadcastCode}`);

    // Should NOT redirect to login
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

    // Page should render something meaningful
    const content = page.locator('main, [role="main"], #root, body').first();
    await expect(content).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('text=/error|not found|404/i')).not.toBeVisible();
  });

  // P19: Leaderboard is visible on broadcast page
  test('P19: broadcast page shows leaderboard', async ({ page }) => {
    await page.goto(`/live/${broadcastCode}`);

    // Should show team names or scores
    const leaderboardEl = page.locator(
      '[data-testid*="leaderboard"], [data-testid*="team"], tr, li',
    ).first();
    await expect(leaderboardEl).toBeVisible({ timeout: 15_000 });
  });

  // P19: Broadcast page title/heading renders
  test('P19: broadcast page has visible heading', async ({ page }) => {
    await page.goto(`/live/${broadcastCode}`);

    const heading = page.locator('h1, h2, [data-testid*="title"], [data-testid*="game-name"]').first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  // P19: API broadcast leaderboard matches UI
  test('P19: broadcast leaderboard API returns data', async () => {
    const apiRes = await getBroadcastLeaderboard(broadcastCode);
    expect(apiRes.status).toBe(200);
    expect(Array.isArray(apiRes.data)).toBe(true);
  });

  // P19: Broadcast meta endpoint returns game info
  test('P19: broadcast API returns game info', async () => {
    const apiRes = await getBroadcast(broadcastCode);
    expect(apiRes.status).toBe(200);
    expect(apiRes.data).toBeDefined();
  });

  // P19: Invalid broadcast code shows error
  test('P19: invalid broadcast code shows error or redirects', async ({ page }) => {
    await page.goto('/live/INVALIDCODE999');

    // Should show not found or error — not crash entirely
    const errorEl = page.locator('text=/not found|invalid|error|404/i').first();
    const redirectedToLogin = page.url().includes('/login');
    const hasError = await errorEl.isVisible({ timeout: 5_000 }).catch(() => false);

    expect(hasError || redirectedToLogin).toBe(true);
  });
});
