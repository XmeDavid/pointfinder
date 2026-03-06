// @scenarios P4, P13, P14
import { test, expect } from '@playwright/test';
import { loginAsOperator } from '../../shared/web-helpers';
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
    // challenge-type-select is a div with buttons, not a <select>
    const textTypeBtn = typeSelect.locator('button', { hasText: /text/i });
    if (await textTypeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await textTypeBtn.click();
    }

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

    const editBtn = page.getByRole('button', { name: /edit/i }).first();
    await expect(editBtn).toBeVisible({ timeout: 10_000 });
    await editBtn.click();

    const titleInput = page.getByTestId('challenge-title-input');
    await expect(titleInput).toBeVisible({ timeout: 10_000 });
    await titleInput.clear();
    await titleInput.fill('Web Challenge Renamed');
    const saveBtn = page.getByTestId('challenge-save-btn');
    await saveBtn.scrollIntoViewIfNeeded();
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    await expect(page.locator('text=Web Challenge Renamed')).toBeVisible({ timeout: 10_000 });
  });

  // P14: Delete challenge
  test('P14: delete challenge via UI', async ({ page }) => {
    // Create a second challenge via API (reliable) so we can test deletion via UI
    const { createChallenge: apiCreateChallenge } = await import('../../shared/api-client');
    const chRes = await apiCreateChallenge(token, gameId, {
      title: 'Web Challenge To Delete',
      description: 'E2E delete test',
      answerType: 'text',
      points: 5,
    });
    expect(chRes.status).toBe(201);

    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/challenges`);

    await expect(page.locator('text=Web Challenge To Delete')).toBeVisible({ timeout: 10_000 });

    // Find the card containing this challenge and click its delete (trash) icon button
    const challengeCard = page.locator('.card, [class*="card"]').filter({ hasText: 'Web Challenge To Delete' });
    const deleteBtn = challengeCard.getByRole('button', { name: /delete/i });
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    await deleteBtn.click();

    // Confirm deletion dialog
    const confirmBtn = page.locator('button[class*="destructive"], button', { hasText: /delete/i }).last();
    await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
    await confirmBtn.click();

    await expect(page.locator('text=Web Challenge To Delete')).not.toBeVisible({ timeout: 10_000 });
  });
});
