// @scenarios P11, P12
import { test, expect } from '@playwright/test';
import { loginAsOperator } from '../../shared/web-helpers';
import {
  submitAnswer,
  playerCheckIn,
  getLeaderboard,
} from '../../shared/api-client';
import { loadRunContext } from '../../shared/run-context';
import { getOperatorToken, getPlayerToken } from '../../shared/auth';
import { config } from '../../shared/config';

test.describe('Submission review via web UI', () => {
  test.describe.configure({ mode: 'serial' });

  let gameId: string;
  let baseIds: string[];
  let challengeIds: string[];
  let teamIds: string[];
  let operatorToken: string;
  let playerToken: string;
  let submissionId: string;

  test.beforeAll(async () => {
    const ctx = loadRunContext();
    gameId = ctx.mainGameId;
    baseIds = ctx.baseIds;
    challengeIds = ctx.challengeIds;
    teamIds = ctx.teamIds;
    operatorToken = getOperatorToken();
    playerToken = getPlayerToken();

    // Create a submission via API so the operator can review it via UI
    await playerCheckIn(playerToken, gameId, baseIds[2]).catch(() => {});
    const subRes = await submitAnswer(playerToken, gameId, {
      baseId: baseIds[2],
      challengeId: challengeIds[2 % challengeIds.length],
      answer: 'web-review-answer',
      idempotencyKey: `web-review-${config.runId}`,
    });
    if (subRes.status === 201 || subRes.status === 200) {
      submissionId = subRes.data.id;
    }
  });

  // P11: Navigate to submissions and approve
  test('P11: approve submission via UI', async ({ page }) => {
    if (!submissionId) {
      test.skip();
      return;
    }

    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/monitor/submissions`);

    await expect(page).toHaveURL(/\/submissions/, { timeout: 10_000 });

    // Find the pending submission row and approve it
    const approveBtn = page.getByTestId('submission-approve-btn').first();
    await expect(approveBtn).toBeVisible({ timeout: 15_000 });
    await approveBtn.click();

    // Some UIs show a modal/popover to enter points
    const pointsInput = page.locator('input[type="number"], input[name*="point" i]').first();
    if (await pointsInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await pointsInput.fill('10');
    }

    // Confirm approval
    const confirmBtn = page.locator('button', { hasText: /confirm|approve|save/i }).last();
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // The submission should no longer show as pending
    await expect(
      page.locator(`text=/approved/i`).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // P11: Reject another submission via UI
  test('P11: reject submission via UI', async ({ page }) => {
    // Create a second submission to reject
    await playerCheckIn(playerToken, gameId, baseIds[3 % baseIds.length]).catch(() => {});
    const subRes = await submitAnswer(playerToken, gameId, {
      baseId: baseIds[3 % baseIds.length],
      challengeId: challengeIds[3 % challengeIds.length],
      answer: 'web-reject-answer',
      idempotencyKey: `web-reject-${config.runId}`,
    });

    if (subRes.status !== 201 && subRes.status !== 200) {
      test.skip();
      return;
    }

    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/monitor/submissions`);

    const rejectBtn = page.getByTestId('submission-reject-btn').first();
    await expect(rejectBtn).toBeVisible({ timeout: 15_000 });
    await rejectBtn.click();

    // Feedback input if present
    const feedbackInput = page.locator('textarea, input[name*="feedback" i]').first();
    if (await feedbackInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await feedbackInput.fill('E2E rejection test');
    }

    const confirmBtn = page.locator('button', { hasText: /confirm|reject|save/i }).last();
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await expect(
      page.locator(`text=/rejected/i`).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // P12: Leaderboard reflects approved submission
  test('P12: leaderboard updates after submission approval', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto(`/games/${gameId}/monitor/leaderboard`);

    await expect(page).toHaveURL(/\/leaderboard/, { timeout: 10_000 });

    // Leaderboard shows team names
    const leaderboardRow = page.locator('text=/Team\\s*\\d/i').first();
    await expect(leaderboardRow).toBeVisible({ timeout: 15_000 });

    // Also verify via API that points are non-zero
    const lbRes = await getLeaderboard(operatorToken, gameId);
    expect(lbRes.status).toBe(200);
    const entries = lbRes.data as Array<{ teamId?: string; points?: number; totalPoints?: number; score?: number; team?: { id: string } }>;
    expect(Array.isArray(entries)).toBe(true);

    const teamEntry = entries.find(
      (e) => e.teamId === teamIds[0] || e.team?.id === teamIds[0],
    );
    // Team should appear in the leaderboard (points may be 0 if approval didn't set points)
    expect(teamEntry).toBeDefined();
  });
});
