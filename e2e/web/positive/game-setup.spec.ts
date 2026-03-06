// @scenarios P1, P2, P8
import { test, expect, type Page } from '@playwright/test';
import {
  createBase,
  createChallenge,
  createTeam,
  nfcLinkBase,
  deleteGame,
  updateGameStatus,
} from '../../shared/api-client';
import { config } from '../../shared/config';
import { throwawayGameFixture, baseFixture, challengeFixture } from '../../shared/fixtures';
import { appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';

test.describe('Game setup via web UI', () => {
  test.describe.configure({ mode: 'serial' });

  let gameId: string;
  let token: string;

  test.beforeAll(async () => {
    token = getOperatorToken();
  });

  test.afterAll(async () => {
    if (gameId) {
      await updateGameStatus(token, gameId, 'ended').catch(() => {});
      await deleteGame(token, gameId).catch(() => {});
    }
  });

  // P1: Login via web UI
  test('P1: login via web UI redirects to games list', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill(config.operatorEmail);
    await page.getByTestId('login-password').fill(config.operatorPassword);
    await page.getByTestId('login-submit').click();

    await expect(page).toHaveURL(/\/games/, { timeout: 15_000 });
  });

  // P1: Verify games list loads
  test('P1: games list page renders after login', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill(config.operatorEmail);
    await page.getByTestId('login-password').fill(config.operatorPassword);
    await page.getByTestId('login-submit').click();

    await expect(page).toHaveURL(/\/games/, { timeout: 15_000 });
    await expect(page.getByTestId('create-game-btn')).toBeVisible();
  });

  // P2: Create game via UI
  test('P2: create game via UI form', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto('/games');
    await page.getByTestId('create-game-btn').click();

    await expect(page).toHaveURL(/\/games\/new/, { timeout: 10_000 });

    const gameName = throwawayGameFixture(config.runId, 'web-setup').name;
    await page.getByTestId('game-name-input').fill(gameName);
    await page.getByTestId('game-save-btn').click();

    // After save, should redirect to game overview or games list
    await expect(page).toHaveURL(/\/games\/[^/]+/, { timeout: 15_000 });

    // Extract gameId from URL
    const url = page.url();
    const match = url.match(/\/games\/([^/]+)/);
    expect(match).not.toBeNull();
    gameId = match![1];
    appendCreatedGameId(gameId);

    // Game card should appear in games list
    await page.goto('/games');
    await expect(page.getByTestId(`game-card-${gameId}`)).toBeVisible({ timeout: 10_000 });
  });

  // P8: Activate game via settings UI
  test('P8: activate game via settings', async ({ page }) => {
    // Pre-condition: set up bases, challenge, team via API so activation is possible
    const baseRes = await createBase(token, gameId, baseFixture(0));
    expect(baseRes.status).toBe(201);
    await nfcLinkBase(token, gameId, baseRes.data.id);

    const chRes = await createChallenge(token, gameId, challengeFixture('text', 0));
    expect(chRes.status).toBe(201);

    await createTeam(token, gameId, { name: 'Web Setup Team' });

    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/settings`);

    // Look for an activate/go-live button
    const activateBtn = page.locator('button', { hasText: /activate|go live|start/i });
    await expect(activateBtn).toBeVisible({ timeout: 10_000 });
    await activateBtn.click();

    // Confirm dialog if any
    const confirmBtn = page.locator('button', { hasText: /confirm|yes|activate/i });
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Verify game shows as live somewhere on the page
    await expect(
      page.locator('text=/live|active|running/i').first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});

async function loginAsOperator(page: Page) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(config.operatorEmail);
  await page.getByTestId('login-password').fill(config.operatorPassword);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/games/, { timeout: 15_000 });
}
