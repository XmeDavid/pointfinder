// @scenarios P6
import { test, expect } from '@playwright/test';
import { loginAsOperator } from '../../shared/web-helpers';
import { createGame, deleteGame, getTeams } from '../../shared/api-client';
import { config } from '../../shared/config';
import { throwawayGameFixture } from '../../shared/fixtures';
import { appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';

test.describe('Team management via web UI', () => {
  test.describe.configure({ mode: 'serial' });

  let token: string;
  let gameId: string;

  test.beforeAll(async () => {
    token = getOperatorToken();
    const gameRes = await createGame(token, throwawayGameFixture(config.runId, 'web-teams'));
    expect(gameRes.status).toBe(201);
    gameId = gameRes.data.id;
    appendCreatedGameId(gameId);
  });

  test.afterAll(async () => {
    if (gameId) {
      await deleteGame(token, gameId).catch(() => {});
    }
  });

  // P6: Create team via UI
  test('P6: create team via UI form', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/teams`);

    const addBtn = page.locator('button', { hasText: /add|create|new team/i });
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();

    await page.getByTestId('team-name-input').fill('Web Team Alpha');
    await page.getByTestId('team-save-btn').click();

    await expect(page.locator('text=Web Team Alpha')).toBeVisible({ timeout: 10_000 });
  });

  test('P6: created team persists via API check', async ({ page: _page }) => {
    const teamsRes = await getTeams(token, gameId);
    expect(teamsRes.status).toBe(200);
    const teams = teamsRes.data as Array<{ name: string }>;
    const found = teams.find((t) => t.name === 'Web Team Alpha');
    expect(found).toBeDefined();
  });

  test('P6: create second team shows both in list', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/teams`);

    const addBtn = page.locator('button', { hasText: /add|create|new team/i });
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();

    await page.getByTestId('team-name-input').fill('Web Team Beta');
    await page.getByTestId('team-save-btn').click();

    await expect(page.locator('text=Web Team Alpha')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Web Team Beta')).toBeVisible({ timeout: 10_000 });
  });

  test('P6: team list page shows join code', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/teams`);

    // Teams should display a join code or join link somewhere
    const joinCodeEl = page.locator('[data-testid*="join"], text=/join code/i').first();
    await expect(joinCodeEl).toBeVisible({ timeout: 10_000 });
  });
});
