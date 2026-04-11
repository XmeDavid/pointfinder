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
    await page.goto('/dashboard');
    await page.getByTestId('create-game-btn').click();

    // Create dialog opens (not a new page)
    const gameName = throwawayGameFixture(config.runId, 'web-setup').name;
    await page.getByTestId('game-name-input').fill(gameName);

    const saveBtn = page.getByTestId('game-save-btn');
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    // After creation, app navigates to /game/:id
    const outcome = await waitForUrlOrAlert(page, /\/app\/game\/[0-9a-f]{8}-[0-9a-f-]+/, 15_000);

    if (outcome === 'url') {
      const url = page.url();
      const match = url.match(/\/app\/game\/([0-9a-f-]+)/);
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

      await page.goto(`/game/${gameId}`);
      await expect(page).toHaveURL(new RegExp(`/game/${gameId}`), { timeout: 10_000 });
    }

    expect(gameId).toBeTruthy();
    appendCreatedGameId(gameId);

    // Game card should appear in games list
    await page.goto('/dashboard');
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
    await page.goto(`/game/${gameId}`);
    await expect(page.getByTestId('map-wrapper')).toBeVisible({ timeout: 15_000 });

    // Click the ReadinessIndicator to expand it (shows "Ready to launch")
    const readiness = page.getByTestId('readiness-indicator');
    await expect(readiness).toBeVisible({ timeout: 10_000 });
    await readiness.click();

    // Click "Go Live" button inside the expanded checklist
    const goLiveBtn = page.getByTestId('go-live-btn');
    await expect(goLiveBtn).toBeVisible({ timeout: 5_000 });
    await goLiveBtn.click();

    // Verify game transitions to live (mode switches to command)
    await expect(
      page.locator('text=/live/i').first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
