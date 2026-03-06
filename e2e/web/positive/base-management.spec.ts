// @scenarios P3, P13, P14
import { test, expect } from '@playwright/test';
import { loginAsOperator } from '../../shared/web-helpers';
import { createGame, deleteGame } from '../../shared/api-client';
import { config } from '../../shared/config';
import { throwawayGameFixture } from '../../shared/fixtures';
import { appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';

test.describe('Base management via web UI', () => {
  test.describe.configure({ mode: 'serial' });

  let token: string;
  let gameId: string;

  test.beforeAll(async () => {
    token = getOperatorToken();
    const gameRes = await createGame(token, throwawayGameFixture(config.runId, 'web-base-mgmt'));
    expect(gameRes.status).toBe(201);
    gameId = gameRes.data.id;
    appendCreatedGameId(gameId);
  });

  test.afterAll(async () => {
    if (gameId) {
      await deleteGame(token, gameId).catch(() => {});
    }
  });

  // P3: Create base via form
  test('P3: create base via UI form', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/bases`);

    // Open create form — look for add/create button
    const addBtn = page.locator('button', { hasText: /add|create|new base/i });
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();

    await page.getByTestId('base-name-input').fill('Web Base 0');
    await page.getByTestId('base-lat-input').fill('38.7223');
    await page.getByTestId('base-lng-input').fill('-9.1393');
    await page.getByTestId('base-save-btn').click();

    // Verify base appears in list
    await expect(page.locator('text=Web Base 0')).toBeVisible({ timeout: 10_000 });
  });

  // P13: Edit base name
  test('P13: edit base name via UI', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/bases`);

    // Click edit on the base created above
    const editBtn = page.locator('button[aria-label*="edit" i], button', { hasText: /edit/i }).first();
    await expect(editBtn).toBeVisible({ timeout: 10_000 });
    await editBtn.click();

    const nameInput = page.getByTestId('base-name-input');
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.clear();
    await nameInput.fill('Web Base Renamed');
    await page.getByTestId('base-save-btn').click();

    await expect(page.locator('text=Web Base Renamed')).toBeVisible({ timeout: 10_000 });
  });

  // P14: Delete base
  test('P14: delete base via UI', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/bases`);

    // Create a second base to delete so we keep at least one
    const addBtn = page.locator('button', { hasText: /add|create|new base/i });
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();

    await page.getByTestId('base-name-input').fill('Web Base To Delete');
    await page.getByTestId('base-lat-input').fill('38.7250');
    await page.getByTestId('base-lng-input').fill('-9.1500');
    await page.getByTestId('base-save-btn').click();

    await expect(page.locator('text=Web Base To Delete')).toBeVisible({ timeout: 10_000 });

    // Find and click delete for that specific base
    const baseRow = page.locator('li, tr, [data-testid*="base"]').filter({ hasText: 'Web Base To Delete' });
    const deleteBtn = baseRow.locator('button', { hasText: /delete|remove/i });
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    await deleteBtn.click();

    // Confirm dialog if any
    const confirmBtn = page.locator('button', { hasText: /confirm|yes|delete/i });
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await expect(page.locator('text=Web Base To Delete')).not.toBeVisible({ timeout: 10_000 });
  });
});
