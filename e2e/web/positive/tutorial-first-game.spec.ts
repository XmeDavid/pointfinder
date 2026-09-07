// @scenarios T1
import { test, expect, type Page } from '@playwright/test';
import { loginAsOperator, openDrawerTab } from '../../shared/web-helpers';
import {
  deleteGame,
  getTutorialProgress,
  putTutorialProgress,
  updateGameStatus,
} from '../../shared/api-client';
import { appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';
import en from '../../../packages/i18n/src/locales/en.json';

const firstGameCopy = (en as unknown as {
  tutorials: { firstGame: Record<string, { title: string }> };
}).tutorials.firstGame;

/** The English title the bubble shows for one scenario step. */
function stepTitle(stepId: string): string {
  const copy = firstGameCopy[stepId];
  if (!copy) throw new Error(`No English copy for first-game step "${stepId}"`);
  return copy.title;
}

/** Wait until the coach bubble is showing the given step. */
async function expectStep(page: Page, stepId: string) {
  await expect(page.getByTestId('tour-bubble-title')).toHaveText(stepTitle(stepId), { timeout: 20_000 });
}

/** Acknowledge an `ack` step and confirm the tour moved on. */
async function ackStep(page: Page, stepId: string, nextStepId: string) {
  await expectStep(page, stepId);
  await page.getByTestId('tour-next').click();
  await expectStep(page, nextStepId);
}

/**
 * Go-live mutates directly from the readiness checklist: there is no
 * confirmation. The tour's own `prepare` expands the checklist, so the button
 * is expected to appear without any click on the toggle.
 */
async function expandReadinessAndGoLive(page: Page) {
  await expect(page.getByTestId('readiness-indicator')).toBeVisible({ timeout: 10_000 });
  const goLive = page.getByTestId('go-live-btn');
  await expect(goLive).toBeVisible({ timeout: 15_000 });
  await goLive.click();
}

test.describe('Guided first-game tutorial', { tag: '@smoke' }, () => {
  test.describe.configure({ mode: 'serial' });

  let token: string;
  let gameId = '';

  test.beforeAll(async () => {
    token = getOperatorToken();
    // Deterministic entry: a skipped row makes the library show Restart.
    const seeded = await putTutorialProgress(token, 'first-game', { status: 'skipped' });
    expect(seeded.status).toBe(200);
  });

  test.afterAll(async () => {
    if (gameId) {
      await updateGameStatus(token, gameId, 'ended').catch(() => {});
      await deleteGame(token, gameId).catch(() => {});
    }
  });

  test('T1: walks the whole first-game scenario with QR bases', async ({ page }) => {
    test.setTimeout(300_000);

    await loginAsOperator(page);

    // ── Enter from the library ────────────────────────────────────────
    await page.goto('/tutorials');
    await expect(page.getByTestId('tutorials-page')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('tutorial-restart-first-game').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    // ── 1. create-game ────────────────────────────────────────────────
    await expectStep(page, 'create-game');
    const gameName = `E2E tutorial ${Date.now()}`;
    await page.locator('[data-testid="create-game-btn"]:visible').click();
    await page.getByTestId('game-name-input').fill(gameName);
    await page.getByTestId('game-save-btn').click();
    await page.waitForURL(/\/game\/[0-9a-f-]{36}/, { timeout: 20_000 });
    gameId = page.url().match(/\/game\/([0-9a-f-]{36})/)![1];
    appendCreatedGameId(gameId);
    await expect(page.getByTestId('map-wrapper')).toBeVisible({ timeout: 20_000 });
    // Created inside the first-game run, so the server marked it as a practice game.
    await expect(page.getByTestId('practice-game-badge')).toBeVisible({ timeout: 10_000 });

    // ── 2. orient (ack) → 3. place-base ───────────────────────────────
    await ackStep(page, 'orient', 'place-base');

    // ── 3–4. first base, walked field by field, QR method ─────────────
    // New Base creates the base and selects it, so its form opens on its own.
    // (The list item must not be clicked: the coach bubble floats over the list.)
    await openDrawerTab(page, 'bases');
    await page.getByTestId('new-entity-btn').click();
    await expect(page.getByTestId('base-name-input')).toBeVisible({ timeout: 20_000 });

    await expectStep(page, 'base-name');
    await page.getByTestId('base-name-input').fill('Tutorial Base One');
    await page.getByTestId('base-lat-input').fill('38.7223');
    await page.getByTestId('base-lng-input').fill('-9.1393');

    await ackStep(page, 'base-description', 'base-coords');
    await ackStep(page, 'base-coords', 'base-method');

    await expectStep(page, 'base-method');
    await page.getByTestId('base-checkin-method-qr').click();

    await ackStep(page, 'base-visibility', 'base-link');
    await ackStep(page, 'base-link', 'base-save');

    await expectStep(page, 'base-save');
    await page.getByTestId('save-base-btn').click();

    // QR branch: the printable code, then close the print sheet.
    await expectStep(page, 'base-qr');
    await page.getByTestId('base-qr-print').click();
    await expect(page.getByTestId('codes-print-sheet')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('codes-print-close').click();

    // ── 5. second-base (no field walkthrough) ─────────────────────────
    // Creating the base is what completes the step, so the tour moves on to
    // new-challenge (and opens the challenges tab) before the base is edited.
    await expectStep(page, 'second-base');
    await openDrawerTab(page, 'bases');
    await page.getByTestId('new-entity-btn').click();
    await expectStep(page, 'new-challenge');

    // Switching tabs deselects the base, and the coach bubble floats over the
    // list, so do what an operator does: pause the tour to the pill, finish the
    // second base, and resume. Resuming re-runs the step's prepare.
    await page.getByTestId('tour-close').click();
    await expect(page.getByTestId('tour-pill')).toBeVisible();
    await openDrawerTab(page, 'bases');
    await page.locator('[data-testid^="base-item-"]').nth(1).click();
    await expect(page.getByTestId('base-name-input')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('base-name-input')).not.toHaveValue('Tutorial Base One');
    await page.getByTestId('base-name-input').fill('Tutorial Base Two');
    await page.getByTestId('base-lat-input').fill('38.7250');
    await page.getByTestId('base-lng-input').fill('-9.1500');
    await page.getByTestId('base-checkin-method-qr').click();
    await page.getByTestId('save-base-btn').click();
    await expect(page.locator('[data-testid^="base-item-"]').nth(1)).toContainText('Tutorial Base Two', { timeout: 10_000 });
    await page.getByTestId('tour-pill-resume').click();

    // ── 6. first challenge, walked field by field ─────────────────────
    await expectStep(page, 'new-challenge');
    await openDrawerTab(page, 'challenges');
    await page.getByTestId('new-entity-btn').click();

    await expectStep(page, 'challenge-title');
    await expect(page.getByTestId('challenge-title-input')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('challenge-title-input').fill('Tutorial Challenge One');

    await ackStep(page, 'challenge-type', 'challenge-content');
    await expectStep(page, 'challenge-content');
    await page.getByTestId('challenge-content').locator('[contenteditable="true"]').click();
    await page.keyboard.type('Find the mill and describe the wheel.');

    await ackStep(page, 'challenge-description', 'challenge-autovalidate');
    // auto-validate stays off, so challenge-answer is filtered out by its `when`.
    await ackStep(page, 'challenge-autovalidate', 'challenge-points');
    await ackStep(page, 'challenge-points', 'challenge-completion');
    await ackStep(page, 'challenge-completion', 'challenge-location-bound');
    await ackStep(page, 'challenge-location-bound', 'challenge-notes');
    await ackStep(page, 'challenge-notes', 'challenge-save');

    await expectStep(page, 'challenge-save');
    await page.getByTestId('save-challenge').click();

    // ── 7. more-challenges ────────────────────────────────────────────
    // One challenge per base completes the step as soon as the second one exists.
    await expectStep(page, 'more-challenges');
    await page.getByTestId('new-entity-btn').click();

    // ── 8. assign ─────────────────────────────────────────────────────
    await expectStep(page, 'assign');
    await openDrawerTab(page, 'bases');
    await page.getByTestId('auto-assign-btn').click();

    // ── 9. new-team → 10. team-code ───────────────────────────────────
    await expectStep(page, 'new-team');
    await openDrawerTab(page, 'teams');
    await page.getByTestId('new-entity-btn').click();

    await ackStep(page, 'team-code', 'go-live');

    // ── 11. go-live → 12. modes ───────────────────────────────────────
    await expandReadinessAndGoLive(page);
    await ackStep(page, 'modes', 'revert');

    // ── 13. revert, keeping progress ──────────────────────────────────
    await expect(page.getByTestId('revert-to-setup-btn')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('revert-to-setup-btn').click();
    await page.getByTestId('progress-keep-btn').click();
    await page.getByTestId('confirm-state-change-btn').click();

    // ── 14. edit a challenge ──────────────────────────────────────────
    await expectStep(page, 'edit');
    await page.locator('[data-testid^="challenge-item-"]').first().click();
    await expect(page.getByTestId('points-input')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('points-input').fill('25');
    await page.getByTestId('save-challenge').click();

    // ── 15. go live again → 16. finish ────────────────────────────────
    await expectStep(page, 'go-live-again');
    await expandReadinessAndGoLive(page);

    // ── 16. finish: a practice game, deleted from the closing card ─────
    await expectStep(page, 'finish');
    await expect(page.getByTestId('practice-game-badge')).toBeVisible();
    await page.getByTestId('practice-delete-btn').click();
    await page.getByTestId('confirm-action-btn').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.getByTestId('tour-bubble')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator(`[data-testid="game-card-${gameId}"]`)).toHaveCount(0, { timeout: 15_000 });
    const deletedId = gameId;
    gameId = '';

    // ── The server row ends completed ─────────────────────────────────
    await expect
      .poll(
        async () => {
          const res = await getTutorialProgress(token);
          const rows = res.data as Array<{ scenarioId: string; status: string }>;
          return rows.find((row) => row.scenarioId === 'first-game')?.status ?? 'missing';
        },
        { timeout: 20_000, message: 'first-game must end completed on the server' },
      )
      .toBe('completed');
    expect(deletedId).toBeTruthy();
  });
});
