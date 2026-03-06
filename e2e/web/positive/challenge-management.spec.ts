// @scenarios P4, P13, P14
import { test, expect, type Page } from '@playwright/test';
import { createGame, deleteGame } from '../../shared/api-client';
import { config } from '../../shared/config';
import { throwawayGameFixture } from '../../shared/fixtures';
import { appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';

test.describe('Challenge management via web UI', () => {
  test.describe.configure({ mode: 'serial' });

  let token: string;
  let gameId: string;

  test.beforeAll(async () => {
    token = getOperatorToken();
    const gameRes = await createGame(token, throwawayGameFixture(config.runId, 'web-challenge-mgmt'));
    expect(gameRes.status).toBe(201);
    gameId = gameRes.data.id;
    appendCreatedGameId(gameId);
  });

  test.afterAll(async () => {
    if (gameId) {
      await deleteGame(token, gameId).catch(() => {});
    }
  });

  // P4: Create challenge via form
  test('P4: create challenge via UI form', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/challenges`);

    const addBtn = page.locator('button', { hasText: /add|create|new challenge/i });
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();

    await page.getByTestId('challenge-title-input').fill('Web Challenge Text');

    // Select challenge type
    const typeSelect = page.getByTestId('challenge-type-select');
    await expect(typeSelect).toBeVisible({ timeout: 5_000 });
    await typeSelect.selectOption({ label: /text/i });

    // Fill points if there is a points input
    const pointsInput = page.locator('input[name*="point" i], [data-testid*="point"]');
    if (await pointsInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await pointsInput.fill('10');
    }

    await page.getByTestId('challenge-save-btn').click();

    await expect(page.locator('text=Web Challenge Text')).toBeVisible({ timeout: 10_000 });
  });

  // P13: Edit challenge title
  test('P13: edit challenge title via UI', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/challenges`);

    const editBtn = page.locator('button[aria-label*="edit" i], button', { hasText: /edit/i }).first();
    await expect(editBtn).toBeVisible({ timeout: 10_000 });
    await editBtn.click();

    const titleInput = page.getByTestId('challenge-title-input');
    await expect(titleInput).toBeVisible({ timeout: 5_000 });
    await titleInput.clear();
    await titleInput.fill('Web Challenge Renamed');
    await page.getByTestId('challenge-save-btn').click();

    await expect(page.locator('text=Web Challenge Renamed')).toBeVisible({ timeout: 10_000 });
  });

  // P14: Delete challenge
  test('P14: delete challenge via UI', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/challenges`);

    // Create a second challenge to delete
    const addBtn = page.locator('button', { hasText: /add|create|new challenge/i });
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();

    await page.getByTestId('challenge-title-input').fill('Web Challenge To Delete');

    const typeSelect = page.getByTestId('challenge-type-select');
    await expect(typeSelect).toBeVisible({ timeout: 5_000 });
    await typeSelect.selectOption({ label: /text/i });

    const pointsInput = page.locator('input[name*="point" i], [data-testid*="point"]');
    if (await pointsInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await pointsInput.fill('5');
    }

    await page.getByTestId('challenge-save-btn').click();
    await expect(page.locator('text=Web Challenge To Delete')).toBeVisible({ timeout: 10_000 });

    const challengeRow = page
      .locator('li, tr, [data-testid*="challenge"]')
      .filter({ hasText: 'Web Challenge To Delete' });
    const deleteBtn = challengeRow.locator('button', { hasText: /delete|remove/i });
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    await deleteBtn.click();

    const confirmBtn = page.locator('button', { hasText: /confirm|yes|delete/i });
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await expect(page.locator('text=Web Challenge To Delete')).not.toBeVisible({ timeout: 10_000 });
  });
});

async function loginAsOperator(page: Page) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(config.operatorEmail);
  await page.getByTestId('login-password').fill(config.operatorPassword);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/games/, { timeout: 15_000 });
}
