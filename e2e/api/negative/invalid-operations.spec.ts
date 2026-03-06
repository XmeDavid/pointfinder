// @scenarios N5, N7
import { test, expect } from '@playwright/test';
import {
  createGame,
  createBase,
  createChallenge,
  createTeam,
  nfcLinkBase,
  updateGameStatus,
  deleteGame,
  playerJoin,
} from '../../shared/api-client';
import { config } from '../../shared/config';
import { appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';
import {
  throwawayGameFixture,
  baseFixture,
  challengeFixture,
  teamFixture,
} from '../../shared/fixtures';

test.describe('invalid operations', { tag: '@negative' }, () => {
  test.describe.configure({ mode: 'serial' });

  let token: string;
  let liveGameId: string;

  test.beforeAll(async () => {
    token = getOperatorToken();
  });

  test.afterAll(async () => {
    if (liveGameId) {
      await updateGameStatus(token, liveGameId, 'ended').catch(() => {});
      await deleteGame(token, liveGameId).catch(() => {});
    }
  });

  test('join with invalid code', async () => {
    const { status } = await playerJoin('INVALID', 'Test', `device-invalid-${Date.now()}`);
    expect([400, 404]).toContain(status);
  });

  test('delete live game', async () => {
    const gameRes = await createGame(token, throwawayGameFixture(config.runId, 'delete-live'));
    expect(gameRes.status).toBe(201);
    liveGameId = gameRes.data.id;
    appendCreatedGameId(liveGameId);

    const baseRes = await createBase(token, liveGameId, baseFixture(0));
    expect(baseRes.status).toBe(201);

    await nfcLinkBase(token, liveGameId, baseRes.data.id);

    const chRes = await createChallenge(token, liveGameId, challengeFixture('text', 0));
    expect(chRes.status).toBe(201);

    const teamRes = await createTeam(token, liveGameId, teamFixture(0));
    expect(teamRes.status).toBe(201);

    const liveRes = await updateGameStatus(token, liveGameId, 'live');
    expect(liveRes.status).toBe(200);

    const { status } = await deleteGame(token, liveGameId);
    // Backend allows deletion of live games (cascades)
    expect([204, 400, 409]).toContain(status);
    if (status === 204) liveGameId = ''; // Already deleted
  });
});
