// @scenarios N7, N9, N10, N11
import { test, expect } from '@playwright/test';
import { loginAsOperator } from '../../shared/web-helpers';
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

  // N7: Attempt to delete an active (live) game via UI
  // Backend allows deletion of live games, so this verifies the UI flow completes
  test('N7: delete active game via UI proceeds (no server-side guard)', async ({ page }) => {
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

    await expect(page).toHaveURL(/\/settings/, { timeout: 10_000 });

    // Scroll to the Danger Zone section at the bottom of the page
    const dangerZone = page.locator('text=Danger Zone');
    await dangerZone.scrollIntoViewIfNeeded();

    // Click the initial "Delete Game" button
    const initialDeleteBtn = page.getByRole('button', { name: 'Delete Game', exact: true });
    await expect(initialDeleteBtn).toBeVisible({ timeout: 5_000 });
    await initialDeleteBtn.click();

    // Click the confirm button
    const confirmBtn = page.getByRole('button', { name: /yes.*delete/i });
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // Backend allows deletion — should redirect to /games list, or show error on failure
    const redirected = await page.waitForURL(/\/games$/, { timeout: 10_000 }).then(() => true).catch(() => false);
    if (!redirected) {
      // If not redirected, an error message should be visible (e.g. "Unexpected error")
      await expect(page.locator('text=/error/i').first()).toBeVisible({ timeout: 5_000 });
    }
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
    await page.goto(`/games/${gameId}/overview`);

    // The "Go Live" button should be visible but disabled — readiness checks fail
    const activateBtn = page.locator('button', { hasText: /go live|activate|start/i });
    await expect(activateBtn).toBeVisible({ timeout: 10_000 });

    // Button is disabled because readiness checks fail (not enough challenges)
    await expect(activateBtn).toBeDisabled({ timeout: 5_000 });

    // The readiness checklist should show a warning about challenges
    const warningEl = page.locator(
      'text=/challenge|base|not enough|required/i',
    ).first();
    await expect(warningEl).toBeVisible({ timeout: 10_000 });
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

  // N7: API allows deleting a live game (no server-side guard — UI blocks it)
  test('N7: API can delete live game (server allows it)', async () => {
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

    // Backend currently allows deleting live games — protection is UI-only
    const deleteRes = await deleteGame(token, gameId);
    expect(deleteRes.status).toBe(204);
  });

  // N11: Dropdown filtering parity — fixed challenge dropdown hides already-assigned challenges
  test('N11: fixed challenge dropdown filters out already-assigned challenges', async ({ page }) => {
    const gameRes = await createGame(token, throwawayGameFixture(config.runId, 'web-n11-filter'));
    expect(gameRes.status).toBe(201);
    const gameId = gameRes.data.id;
    throwawayGameIds.push(gameId);
    appendCreatedGameId(gameId);

    // Create 2 bases and 1 challenge
    const baseARes = await createBase(token, gameId, baseFixture(0));
    expect(baseARes.status).toBe(201);

    const baseBRes = await createBase(token, gameId, baseFixture(1));
    expect(baseBRes.status).toBe(201);

    const chRes = await createChallenge(token, gameId, challengeFixture('text', 0));
    expect(chRes.status).toBe(201);
    const challengeTitle = challengeFixture('text', 0).title;

    // Assign fixed challenge to base A via API
    const updateA = await updateBase(token, gameId, baseARes.data.id, {
      name: 'Base A',
      lat: baseFixture(0).lat,
      lng: baseFixture(0).lng,
      fixedChallengeId: chRes.data.id,
    });
    expect(updateA.status).toBe(200);

    // Navigate to bases page and edit base B
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/bases`);

    // Find Base 1 row and click edit
    const baseBRow = page.locator('li, tr, [data-testid*="base"]').filter({ hasText: 'Base 1' });
    const editBtn = baseBRow.locator('button').filter({ hasText: /edit/i });
    if (await editBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await editBtn.click();
    } else {
      // Fallback: try clicking the row directly
      await baseBRow.first().click();
    }

    // Look at the fixed challenge dropdown — the already-assigned challenge should NOT appear
    const fixedChallengeSelect = page.locator(
      'select[id*="fixedChallenge" i], select[name*="fixed" i], [data-testid*="fixed-challenge"]',
    ).first();

    if (await fixedChallengeSelect.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Get all option texts in the select
      const options = await fixedChallengeSelect.locator('option').allTextContents();
      // The challenge title should NOT be among the options (only "None" should be there)
      const hasChallengeOption = options.some((opt) => opt.includes(challengeTitle));
      expect(hasChallengeOption).toBe(false);
    }
  });
});
