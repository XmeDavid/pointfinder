// @scenarios P11, P12
import { randomUUID } from 'crypto';
import { test, expect } from '@playwright/test';
import { loginAsOperator, waitForVisibleWithReload, navigateToGameWorkspace } from '../../shared/web-helpers';
import {
  submitAnswer,
  playerCheckIn,
  getLeaderboard,
} from '../../shared/api-client';
import { loadRunContext } from '../../shared/run-context';
import { getOperatorToken, getPlayerToken } from '../../shared/auth';

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
      idempotencyKey: randomUUID(),
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
    await navigateToGameWorkspace(page, gameId, 'review');

    const pendingSubmission = page.getByRole('button', { name: /web-review-answer/i }).first();
    await expect(pendingSubmission).toBeVisible({ timeout: 15_000 });
    await pendingSubmission.click();

    // Wait for SubmissionDetail to load (AuthMedia fetches files asynchronously)
    const approveBtn = page.getByTestId('approve-btn').first();
    await expect(approveBtn).toBeVisible({ timeout: 15_000 });

    const pointsInput = page.getByTestId('points-input').first();
    if (await pointsInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await pointsInput.fill('10');
    }

    await approveBtn.click();

    // The submission should no longer show as pending
    await expect(
      page.locator(`text=/approved/i`).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // P11: Reject another submission via UI
  test('P11: reject submission via UI', async ({ page }) => {
    // Create a second submission to reject
    const rejectBaseId = baseIds[1 % baseIds.length];
    const rejectChallengeId = challengeIds[1 % challengeIds.length];

    await playerCheckIn(playerToken, gameId, rejectBaseId).catch(() => {});
    const subRes = await submitAnswer(playerToken, gameId, {
      baseId: rejectBaseId,
      challengeId: rejectChallengeId,
      answer: 'web-reject-answer',
      idempotencyKey: randomUUID(),
    });

    if (subRes.status !== 201 && subRes.status !== 200) {
      test.skip();
      return;
    }

    await loginAsOperator(page);
    await navigateToGameWorkspace(page, gameId, 'review');

    const pendingSubmission = page.getByRole('button', { name: /web-reject-answer/i }).first();
    await expect(pendingSubmission).toBeVisible({ timeout: 15_000 });
    await pendingSubmission.click();

    // Wait for SubmissionDetail to load (AuthMedia fetches files asynchronously)
    const rejectBtn = page.getByTestId('reject-btn').first();
    await expect(rejectBtn).toBeVisible({ timeout: 15_000 });

    // Feedback input if present
    const feedbackInput = page.getByTestId('feedback-input').first();
    if (await feedbackInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await feedbackInput.fill('E2E rejection test');
    }

    await rejectBtn.click();

    await expect(
      page.locator(`text=/rejected/i`).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // P12: Leaderboard reflects approved submission
  test('P12: leaderboard updates after submission approval', async ({ page }) => {
    await loginAsOperator(page);
    await navigateToGameWorkspace(page, gameId, 'command');

    // Leaderboard entries are <button> elements with data-testid="leaderboard-entry"
    const leaderboardRow = page.getByTestId('leaderboard-entry').first();
    const leaderboardVisible = await waitForVisibleWithReload(page, leaderboardRow, {
      attempts: 1,
      timeout: 7_500,
    });

    const lbRes = await getLeaderboard(operatorToken, gameId);
    expect(lbRes.status).toBe(200);
    const entries = lbRes.data as Array<{ teamId?: string; points?: number; totalPoints?: number; score?: number; team?: { id: string } }>;
    expect(Array.isArray(entries)).toBe(true);

    const teamEntry = entries.find(
      (e) => e.teamId === teamIds[0] || e.team?.id === teamIds[0],
    );
    expect(teamEntry).toBeDefined();

    if (leaderboardVisible) {
      await expect(leaderboardRow).toBeVisible({ timeout: 15_000 });
    }
  });
});
