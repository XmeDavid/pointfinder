// @scenarios P17
import { test, expect } from '@playwright/test';
import {
  loginAsOperator,
  navigateToGameWorkspace,
  switchWorkspaceMode,
} from '../../shared/web-helpers';
import { loadRunContext } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';

test.describe('Monitoring pages via web UI', () => {
  test.describe.configure({ mode: 'serial' });

  let gameId: string;

  test.beforeAll(async () => {
    const ctx = loadRunContext();
    gameId = ctx.mainGameId;
    // suppress unused warning
    void getOperatorToken();
  });

  // P17: Leaderboard renders in command mode
  test('P17: leaderboard renders with data in command mode', async ({ page }) => {
    await loginAsOperator(page);
    await navigateToGameWorkspace(page, gameId, 'command');

    // Page should not show an error state
    await expect(page.locator('text=/error|failed to load/i')).not.toBeVisible();

    // Leaderboard entries are <button> elements with data-testid="leaderboard-entry"
    const teamEntry = page.getByTestId('leaderboard-entry').first();
    await expect(teamEntry).toBeVisible({ timeout: 15_000 });
  });

  // P17: Activity feed renders in command mode
  test('P17: activity feed renders in command mode', async ({ page }) => {
    await loginAsOperator(page);
    await navigateToGameWorkspace(page, gameId, 'command');

    await expect(page.locator('text=/error|failed to load/i')).not.toBeVisible();

    // Activity feed toggle or feed should be visible
    const activityFeed = page.getByTestId('activity-feed-toggle').or(page.getByTestId('activity-feed'));
    await expect(activityFeed.first()).toBeVisible({ timeout: 10_000 });
  });

  // P17: Submissions renders in review mode
  test('P17: submissions overlay renders in review mode', async ({ page }) => {
    await loginAsOperator(page);
    await navigateToGameWorkspace(page, gameId, 'review');

    await expect(page.locator('text=/error|failed to load/i')).not.toBeVisible();

    // Review overlay should be visible
    const reviewOverlay = page.getByTestId('review-overlay');
    await expect(reviewOverlay).toBeVisible({ timeout: 10_000 });
  });

  // P17: Mode switching works via IconRail
  test('P17: mode switching between build, command, and review works', async ({ page }) => {
    await loginAsOperator(page);
    await navigateToGameWorkspace(page, gameId);

    // Default is build mode — verify map is visible
    await expect(page.getByTestId('map-wrapper')).toBeVisible({ timeout: 10_000 });

    // Switch to command mode — leaderboard should appear
    await switchWorkspaceMode(page, 'command');
    const leaderboard = page.getByTestId('leaderboard').or(page.getByTestId('leaderboard-toggle'));
    await expect(leaderboard.first()).toBeVisible({ timeout: 10_000 });

    // Switch to review mode — review overlay should appear
    await switchWorkspaceMode(page, 'review');
    await expect(page.getByTestId('review-overlay')).toBeVisible({ timeout: 10_000 });
  });

  // P17: Game workspace renders (replaces old overview page test)
  test('P17: game workspace renders without errors', async ({ page }) => {
    await loginAsOperator(page);
    await navigateToGameWorkspace(page, gameId);

    await expect(page.locator('text=/error|failed to load/i')).not.toBeVisible();

    // Should show the map and workspace content
    await expect(page.getByTestId('map-wrapper')).toBeVisible({ timeout: 10_000 });
  });
});
