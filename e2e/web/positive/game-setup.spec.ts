// @scenarios P1, P2, P8
import { test, expect } from '@playwright/test';
import { loginAsOperator } from '../../shared/web-helpers';
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

  // P1: Login and verify games list loads
  test('P1: games list page renders after login', async ({ page }) => {
    await loginAsOperator(page);
    await expect(page.getByTestId('create-game-btn')).toBeVisible({ timeout: 10_000 });
  });

  // P2: Create game via UI
  test('P2: create game via UI form', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto('/games');
    await page.getByTestId('create-game-btn').click();

    await expect(page).toHaveURL(/\/games\/new/, { timeout: 10_000 });

    const gameName = throwawayGameFixture(config.runId, 'web-setup').name;
    await page.getByTestId('game-name-input').fill(gameName);

    // Scroll save button into view and click — the form is long
    const saveBtn = page.getByTestId('game-save-btn');
    await saveBtn.scrollIntoViewIfNeeded();
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    // After save, should redirect to game overview (UUID in URL, not /games/new)
    await expect(page).toHaveURL(/\/games\/[0-9a-f]{8}-[0-9a-f]{4}/, { timeout: 20_000 });

    // Extract gameId from URL (may include /overview suffix)
    const url = page.url();
    const match = url.match(/\/games\/([0-9a-f-]+)/);
    expect(match).not.toBeNull();
    gameId = match![1].replace(/\/.*$/, '');
    appendCreatedGameId(gameId);

    // Game card should appear in games list
    await page.goto('/games');
    await expect(page.locator(`[data-testid="game-card-${gameId}"]`)).toBeVisible({ timeout: 10_000 });
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
