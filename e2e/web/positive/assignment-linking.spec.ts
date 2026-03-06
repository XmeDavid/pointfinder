// @scenarios P5
import { test, expect, type Page } from '@playwright/test';
import {
  createGame,
  deleteGame,
  createBase,
  createChallenge,
  getAssignments,
} from '../../shared/api-client';
import { config } from '../../shared/config';
import { throwawayGameFixture, baseFixture, challengeFixture } from '../../shared/fixtures';
import { appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';

test.describe('Assignment linking via web UI', () => {
  test.describe.configure({ mode: 'serial' });

  let token: string;
  let gameId: string;
  let baseId: string;
  let challengeId: string;

  test.beforeAll(async () => {
    token = getOperatorToken();

    const gameRes = await createGame(token, throwawayGameFixture(config.runId, 'web-assignments'));
    expect(gameRes.status).toBe(201);
    gameId = gameRes.data.id;
    appendCreatedGameId(gameId);

    const baseRes = await createBase(token, gameId, baseFixture(0));
    expect(baseRes.status).toBe(201);
    baseId = baseRes.data.id;

    const chRes = await createChallenge(token, gameId, challengeFixture('text', 0));
    expect(chRes.status).toBe(201);
    challengeId = chRes.data.id;
  });

  test.afterAll(async () => {
    if (gameId) {
      await deleteGame(token, gameId).catch(() => {});
    }
  });

  // P5: Link challenge to base via UI
  test('P5: assign challenge to base via UI', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/assignments`);

    // The assignments page should show bases and allow selecting a challenge to assign
    await expect(page).toHaveURL(/\/assignments/, { timeout: 10_000 });

    // Locate the assignment challenge select for our base
    const assignSelect = page.getByTestId('assignment-challenge-select').first();
    await expect(assignSelect).toBeVisible({ timeout: 10_000 });
    await assignSelect.selectOption({ value: challengeId });

    // Save if there is an explicit save button; some UIs auto-save on select
    const saveBtn = page.locator('button', { hasText: /save|assign|link/i }).first();
    if (await saveBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await saveBtn.click();
    }

    // Verify via API that the assignment exists
    await page.waitForTimeout(1_000);
    const assignRes = await getAssignments(token, gameId);
    expect(assignRes.status).toBe(200);
    const assignments = assignRes.data as Array<{ baseId: string; challengeId: string }>;
    const linked = assignments.find(
      (a) => a.baseId === baseId && a.challengeId === challengeId,
    );
    expect(linked).toBeDefined();
  });

  test('P5: assignments page shows existing assignment', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/assignments`);

    // After assignment, the select should show the challenge or the page should
    // indicate it is linked
    const assignSelect = page.getByTestId('assignment-challenge-select').first();
    await expect(assignSelect).toBeVisible({ timeout: 10_000 });
    // The selected option should match the challenge we assigned
    const selectedValue = await assignSelect.inputValue();
    expect(selectedValue).toBe(challengeId);
  });
});

async function loginAsOperator(page: Page) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(config.operatorEmail);
  await page.getByTestId('login-password').fill(config.operatorPassword);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/games/, { timeout: 15_000 });
}
