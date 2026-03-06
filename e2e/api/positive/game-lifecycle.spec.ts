// @scenarios P2, P8, P13
import { test, expect } from '@playwright/test';
import {
  createGame,
  getGame,
  updateGame,
  updateGameStatus,
  deleteGame,
  createBase,
  nfcLinkBase,
  createChallenge,
  createTeam,
} from '../../shared/api-client';
import { config } from '../../shared/config';
import { throwawayGameFixture, baseFixture, challengeFixture } from '../../shared/fixtures';
import { appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';

test.describe('Game lifecycle - positive', () => {
  test.describe.configure({ mode: 'serial' });

  let token: string;
  let gameId: string;

  test.beforeAll(async () => {
    token = getOperatorToken();
  });

  test.afterAll(async () => {
    if (gameId) {
      await updateGameStatus(token, gameId, 'ended').catch(() => {});
      await deleteGame(token, gameId);
    }
  });

  test('P2: create game', async () => {
    const { status, data } = await createGame(token, throwawayGameFixture(config.runId, 'lifecycle'));
    expect(status).toBe(201);
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('name');
    gameId = data.id;
    appendCreatedGameId(gameId);
  });

  test('P8: activate game', async () => {
    const baseRes = await createBase(token, gameId, baseFixture(0));
    expect(baseRes.status).toBe(201);

    await nfcLinkBase(token, gameId, baseRes.data.id);

    const chRes = await createChallenge(token, gameId, challengeFixture('text', 0));
    expect(chRes.status).toBe(201);

    const teamRes = await createTeam(token, gameId, { name: 'Team Lifecycle' });
    expect(teamRes.status).toBe(201);

    const { status, data } = await updateGameStatus(token, gameId, 'live');
    expect(status).toBe(200);
    expect(data.status).toBe('live');
  });

  test('P13: update game name', async () => {
    const newName = `E2E ${config.runId} lifecycle-renamed`;
    const updateRes = await updateGame(token, gameId, { name: newName });
    expect(updateRes.status).toBe(200);

    const { status, data } = await getGame(token, gameId);
    expect(status).toBe(200);
    expect(data.name).toBe(newName);
  });
});
