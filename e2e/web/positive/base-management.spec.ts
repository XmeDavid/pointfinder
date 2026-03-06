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

    // Dialog contains a MapPicker which can be slow to initialize
    const nameInput = page.getByTestId('base-name-input');
    await expect(nameInput).toBeVisible({ timeout: 15_000 });
    await nameInput.fill('Web Base 0');
    await page.getByTestId('base-lat-input').fill('38.7223');
    await page.getByTestId('base-lng-input').fill('-9.1393');

    const saveBtn = page.getByTestId('base-save-btn');
    await saveBtn.scrollIntoViewIfNeeded();
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    // Verify base appears in list
    await expect(page.locator('text=Web Base 0')).toBeVisible({ timeout: 15_000 });
  });

  // P13: Edit base name
  test('P13: edit base name via UI', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/bases`);

    // Click edit on the base created above (icon button with aria-label)
    const editBtn = page.getByRole('button', { name: /edit/i }).first();
    await expect(editBtn).toBeVisible({ timeout: 10_000 });
    await editBtn.click();

    // Dialog contains a MapPicker which can be slow to initialize
    const nameInput = page.getByTestId('base-name-input');
    await expect(nameInput).toBeVisible({ timeout: 15_000 });
    await nameInput.clear();
    await nameInput.fill('Web Base Renamed');
    const saveBtn = page.getByTestId('base-save-btn');
    await saveBtn.scrollIntoViewIfNeeded();
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    await expect(page.locator('text=Web Base Renamed')).toBeVisible({ timeout: 10_000 });
  });

  // P14: Delete base
  test('P14: delete base via UI', async ({ page }) => {
    // Create a second base via API (reliable) so we can test deletion via UI
    const { createBase: apiCreateBase, nfcLinkBase } = await import('../../shared/api-client');
    const baseRes = await apiCreateBase(token, gameId, {
      name: 'Web Base To Delete',
      description: 'E2E delete test',
      lat: 38.725,
      lng: -9.15,
    });
    expect(baseRes.status).toBe(201);

    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/bases`);

    await expect(page.locator('text=Web Base To Delete')).toBeVisible({ timeout: 10_000 });

    // Find the card containing this base and click its delete (trash) icon button
    const baseCard = page.locator('.card, [class*="card"]').filter({ hasText: 'Web Base To Delete' });
    const deleteBtn = baseCard.getByRole('button', { name: /delete/i });
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    await deleteBtn.click();

    // Confirm deletion dialog
    const confirmBtn = page.locator('button[class*="destructive"], button', { hasText: /delete/i }).last();
    await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
    await confirmBtn.click();

    await expect(page.locator('text=Web Base To Delete')).not.toBeVisible({ timeout: 10_000 });
  });
});
