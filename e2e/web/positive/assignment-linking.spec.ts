// @scenarios P5
import { test, expect } from '@playwright/test';
import { loginAsOperator } from '../../shared/web-helpers';
import {
  createGame,
  deleteGame,
  createBase,
  createChallenge,
  createAssignment,
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
    // Ensure an assignment exists via API (don't rely on previous test's UI state)
    const existingAssignments = await getAssignments(token, gameId);
    if (!Array.isArray(existingAssignments.data) || existingAssignments.data.length === 0) {
      await createAssignment(token, gameId, { baseId, challengeId });
    }

    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/assignments`);

    // Existing assignments are rendered as read-only rows with challenge title and points badge.
    // Verify the challenge title appears in the assignment list.
    const challengeTitle = page.locator('text=/Challenge Text/i').first();
    await expect(challengeTitle).toBeVisible({ timeout: 15_000 });
  });
});
