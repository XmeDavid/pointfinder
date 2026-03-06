// @scenarios P19
import { test, expect, type Page } from '@playwright/test';
import { getBroadcast, getBroadcastLeaderboard } from '../../shared/api-client';
import { loadRunContext } from '../../shared/run-context';
import { forceEnglishLocale } from '../../shared/web-helpers';
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
    await forceEnglishLocale(page);
    await page.goto(`/live/${broadcastCode}`);

    // Should NOT redirect to login
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

    // Page should render something meaningful
    const content = page.locator('main, [role="main"], #root, body').first();
    await expect(content).toBeVisible({ timeout: 10_000 });

    // Check for error text in both English and Portuguese
    await expect(page.locator('text=/error|not found|404|não encontrad/i')).not.toBeVisible();
  });

  // P19: Leaderboard is visible on broadcast page
  test('P19: broadcast page shows leaderboard', async ({ page }) => {
    await forceEnglishLocale(page);
    await page.goto(`/live/${broadcastCode}`);

    // Should show team names or scores (broadcast page uses div-based layout)
    // Team names from fixtures are "Team 0" and "Team 1"
    const leaderboardEl = page.locator('text=/Team\\s*\\d/i').first();
    await expect(leaderboardEl).toBeVisible({ timeout: 20_000 });
  });

  // P19: Broadcast page title/heading renders
  test('P19: broadcast page has visible heading', async ({ page }) => {
    await forceEnglishLocale(page);
    await page.goto(`/live/${broadcastCode}`);

    // The broadcast page shows the game name in a span, or PointFinder heading
    const heading = page.locator('h1, h2, span.font-semibold, span.font-medium, [data-testid*="title"], [data-testid*="game-name"]').first();
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
    await forceEnglishLocale(page);
    await page.goto('/live/INVALIDCODE999');

    // Wait for navigation to settle
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // Check if redirected to login or live entry page
    const url = page.url();
    const redirectedToLogin = url.includes('/login');
    const redirectedToLiveEntry = url.endsWith('/live') || url.endsWith('/live/');

    if (redirectedToLogin || redirectedToLiveEntry) {
      // Redirecting away from invalid code is acceptable
      expect(true).toBe(true);
      return;
    }

    // Otherwise, should show not found or error text (English or Portuguese)
    const errorEl = page.locator('text=/not found|invalid|error|404|não encontrad|transmissão/i').first();
    await expect(errorEl).toBeVisible({ timeout: 10_000 });
  });
});
