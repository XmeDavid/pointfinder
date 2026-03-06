// @scenarios N7, N9, N10
import { test, expect, type Page } from '@playwright/test';
import {
  createGame,
  createBase,
  createChallenge,
  createTeam,
  nfcLinkBase,
  updateGameStatus,
  deleteGame,
  updateBase,
  getAssignments,
} from '../../shared/api-client';
import { config } from '../../shared/config';
import { throwawayGameFixture, baseFixture, challengeFixture, teamFixture } from '../../shared/fixtures';
import { appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';

test.describe('Business rules - negative', { tag: '@negative' }, () => {
  test.describe.configure({ mode: 'serial' });

  let token: string;
  const throwawayGameIds: string[] = [];

  test.beforeAll(async () => {
    token = getOperatorToken();
  });

  test.afterAll(async () => {
    for (const gId of throwawayGameIds) {
      await updateGameStatus(token, gId, 'ended').catch(() => {});
      await deleteGame(token, gId).catch(() => {});
    }
  });

  // N7: Try to delete an active (live) game — UI should show an error
  test('N7: cannot delete an active game via UI', async ({ page }) => {
    // Set up a game and activate it via API
    const gameRes = await createGame(token, throwawayGameFixture(config.runId, 'web-n7-active'));
    expect(gameRes.status).toBe(201);
    const gameId = gameRes.data.id;
    throwawayGameIds.push(gameId);
    appendCreatedGameId(gameId);

    const baseRes = await createBase(token, gameId, baseFixture(0));
    expect(baseRes.status).toBe(201);
    await nfcLinkBase(token, gameId, baseRes.data.id);

    const chRes = await createChallenge(token, gameId, challengeFixture('text', 0));
    expect(chRes.status).toBe(201);

    await createTeam(token, gameId, teamFixture(0));

    const activateRes = await updateGameStatus(token, gameId, 'live');
    expect(activateRes.status).toBe(200);

    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/settings`);

    // Attempt to delete via UI
    const deleteBtn = page.locator('button', { hasText: /delete game/i });
    await expect(deleteBtn).toBeVisible({ timeout: 10_000 });
    await deleteBtn.click();

    // Confirm the deletion attempt
    const confirmBtn = page.locator('button', { hasText: /confirm|yes|delete/i });
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Expect an error message — cannot delete live game
    const errorEl = page.locator(
      'text=/cannot delete|active|live|end the game|stop first/i',
    ).first();
    await expect(errorEl).toBeVisible({ timeout: 10_000 });

    // Game should still exist — still on settings or games page
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/games/);
  });

  // N9: Fixed challenge assigned to multiple bases — UI behaviour
  test('N9: fixed challenge on multiple bases shows warning or is allowed', async ({ page }) => {
    const gameRes = await createGame(token, throwawayGameFixture(config.runId, 'web-n9-fixed'));
    expect(gameRes.status).toBe(201);
    const gameId = gameRes.data.id;
    throwawayGameIds.push(gameId);
    appendCreatedGameId(gameId);

    const baseARes = await createBase(token, gameId, baseFixture(0));
    expect(baseARes.status).toBe(201);

    const baseBRes = await createBase(token, gameId, baseFixture(1));
    expect(baseBRes.status).toBe(201);

    const chRes = await createChallenge(token, gameId, challengeFixture('text', 0));
    expect(chRes.status).toBe(201);
    const challengeId = chRes.data.id;

    // Assign fixed challenge to first base via API
    const updateA = await updateBase(token, gameId, baseARes.data.id, {
      name: 'Base A',
      lat: baseFixture(0).lat,
      lng: baseFixture(0).lng,
      fixedChallengeId: challengeId,
    });
    expect(updateA.status).toBe(200);

    // Try to assign same fixed challenge to second base via UI
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/bases`);

    // Find edit for Base B
    const baseBRow = page.locator('li, tr, [data-testid*="base"]').filter({ hasText: 'Base 1' });
    const editBtn = baseBRow.locator('button', { hasText: /edit/i });
    if (await editBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await editBtn.click();
    } else {
      // If individual row edit not found, try API approach for validation check
      const updateB = await updateBase(token, gameId, baseBRes.data.id, {
        name: 'Base B',
        lat: baseFixture(1).lat,
        lng: baseFixture(1).lng,
        fixedChallengeId: challengeId,
      });
      // Backend allows or rejects — both are acceptable outcomes for N9
      expect([200, 400, 409]).toContain(updateB.status);
      return;
    }

    // Look for a fixed challenge selector
    const fixedChallengeSelect = page.locator(
      'select[name*="fixed" i], [data-testid*="fixed-challenge"]',
    ).first();
    if (await fixedChallengeSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await fixedChallengeSelect.selectOption({ value: challengeId });
      const saveBtn = page.getByTestId('base-save-btn');
      await saveBtn.click();

      // Outcome: either a warning is shown or it saves (backend allows it)
      const warningEl = page.locator('text=/conflict|already assigned|warning/i').first();
      const saved = await page.locator('text=Base B').isVisible({ timeout: 5_000 }).catch(() => false);
      const hasWarning = await warningEl.isVisible({ timeout: 3_000 }).catch(() => false);

      // Either a warning or successful save — both are acceptable
      expect(hasWarning || saved).toBe(true);
    }
  });

  // N10: Activating a game with more bases than challenges is blocked
  test('N10: cannot activate game with more bases than challenges', async ({ page }) => {
    const gameRes = await createGame(token, throwawayGameFixture(config.runId, 'web-n10-imbalance'));
    expect(gameRes.status).toBe(201);
    const gameId = gameRes.data.id;
    throwawayGameIds.push(gameId);
    appendCreatedGameId(gameId);

    // Create 3 bases, 1 challenge, 1 team — should fail activation
    for (let i = 0; i < 3; i++) {
      const bRes = await createBase(token, gameId, baseFixture(i));
      expect(bRes.status).toBe(201);
      await nfcLinkBase(token, gameId, bRes.data.id);
    }

    const chRes = await createChallenge(token, gameId, challengeFixture('text', 0));
    expect(chRes.status).toBe(201);

    await createTeam(token, gameId, teamFixture(0));

    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/settings`);

    const activateBtn = page.locator('button', { hasText: /activate|go live|start/i });
    await expect(activateBtn).toBeVisible({ timeout: 10_000 });
    await activateBtn.click();

    // Confirm if dialog
    const confirmBtn = page.locator('button', { hasText: /confirm|yes|activate/i });
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Expect an error — cannot go live with imbalanced bases/challenges
    const errorEl = page.locator(
      'text=/challenge|base|cannot|imbalance|not enough|required/i',
    ).first();
    await expect(errorEl).toBeVisible({ timeout: 10_000 });

    // Game should NOT be live
    const liveIndicator = page.locator('text=/live|active|running/i').first();
    await expect(liveIndicator).not.toBeVisible({ timeout: 3_000 });
  });

  // N10: Validate via API: more bases than challenges blocks go-live
  test('N10: API confirms more-bases-than-challenges blocks activation', async () => {
    const gameRes = await createGame(token, throwawayGameFixture(config.runId, 'web-n10-api'));
    expect(gameRes.status).toBe(201);
    const gameId = gameRes.data.id;
    throwawayGameIds.push(gameId);
    appendCreatedGameId(gameId);

    for (let i = 0; i < 3; i++) {
      const bRes = await createBase(token, gameId, baseFixture(i));
      expect(bRes.status).toBe(201);
      await nfcLinkBase(token, gameId, bRes.data.id);
    }

    await createChallenge(token, gameId, challengeFixture('text', 0));
    await createTeam(token, gameId, teamFixture(0));

    const { status } = await updateGameStatus(token, gameId, 'live');
    expect(status).toBe(400);
  });

  // N7: API confirms cannot delete live game directly
  test('N7: API confirms live game cannot be deleted', async () => {
    const gameRes = await createGame(token, throwawayGameFixture(config.runId, 'web-n7-api'));
    expect(gameRes.status).toBe(201);
    const gameId = gameRes.data.id;
    throwawayGameIds.push(gameId);
    appendCreatedGameId(gameId);

    const baseRes = await createBase(token, gameId, baseFixture(0));
    await nfcLinkBase(token, gameId, baseRes.data.id);
    await createChallenge(token, gameId, challengeFixture('text', 0));
    await createTeam(token, gameId, teamFixture(0));

    const activateRes = await updateGameStatus(token, gameId, 'live');
    expect(activateRes.status).toBe(200);

    const deleteRes = await deleteGame(token, gameId);
    expect([400, 409, 422]).toContain(deleteRes.status);
  });
});

async function loginAsOperator(page: Page) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(config.operatorEmail);
  await page.getByTestId('login-password').fill(config.operatorPassword);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/games/, { timeout: 15_000 });
}
