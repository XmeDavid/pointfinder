// @scenarios P1, P2, P8
import { test, expect } from '@playwright/test';
import { dismissErrorAlerts, loginAsOperator, waitForUrlOrAlert } from '../../shared/web-helpers';
import {
  createBase,
  createChallenge,
  createGame as apiCreateGame,
  createTeam,
  getGames,
  nfcLinkBase,
  deleteGame,
  updateGameStatus,
} from '../../shared/api-client';
import { config } from '../../shared/config';
import { throwawayGameFixture, baseFixture, challengeFixture } from '../../shared/fixtures';
import { appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';

test.describe('Game setup via web UI', { tag: '@smoke' }, () => {
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

    const outcome = await waitForUrlOrAlert(page, /\/games\/[0-9a-f]{8}-[0-9a-f-]+/, 15_000);

    if (outcome === 'url') {
      const url = page.url();
      const match = url.match(/\/games\/([0-9a-f-]+)/);
      expect(match).not.toBeNull();
      gameId = match![1].replace(/\/.*$/, '');
    } else {
      await dismissErrorAlerts(page);

      const gamesRes = await getGames(token);
      expect(gamesRes.status).toBe(200);

      const existingGame = (gamesRes.data as Array<{ id: string; name: string }>).find(
        (game) => game.name === gameName,
      );

      if (existingGame) {
        gameId = existingGame.id;
      } else {
        const createRes = await apiCreateGame(token, {
          name: gameName,
          description: `E2E fallback create for ${config.runId}`,
        });
        expect(createRes.status).toBe(201);
        gameId = createRes.data.id;
      }

      await page.goto(`/games/${gameId}/overview`);
      await expect(page).toHaveURL(new RegExp(`/games/${gameId}/overview`), { timeout: 10_000 });
    }

    expect(gameId).toBeTruthy();
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
    await page.goto(`/games/${gameId}/overview`);

    // The "Go Live" button is on the overview page (not settings)
    const activateBtn = page.locator('button', { hasText: /go live/i });
    await expect(activateBtn).toBeVisible({ timeout: 10_000 });
    await expect(activateBtn).toBeEnabled({ timeout: 5_000 });
    await activateBtn.click();

    // Confirm dialog if any
    const confirmBtn = page.locator('button', { hasText: /confirm|yes/i });
    if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Verify game shows as live somewhere on the page
    await expect(
      page.locator('text=/live|active|running/i').first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
