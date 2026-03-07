// @scenarios P6, P7
import { test, expect } from '@playwright/test';
import {
  createTeam,
  createGame,
  deleteGame,
  playerJoin,
} from '../../shared/api-client';
import { config } from '../../shared/config';
import { throwawayGameFixture, teamFixture } from '../../shared/fixtures';
import { loadRunContext, appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';

test.describe('team and players', () => {
  let token: string;
  let throwawayGameId: string;

  test.beforeAll(async () => {
    token = getOperatorToken();
  });

  test.afterAll(async () => {
    if (throwawayGameId) {
      await deleteGame(token, throwawayGameId);
    }
  });

  test('create team on throwaway game', async () => {
    const game = await createGame(token, throwawayGameFixture(config.runId, 'P6-teams'));
    expect(game.status).toBe(201);
    throwawayGameId = game.data.id;
    appendCreatedGameId(throwawayGameId);

    const { status, data } = await createTeam(token, throwawayGameId, { name: teamFixture(0).name });
    expect(status).toBe(201);
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('name');
    expect(data).toHaveProperty('joinCode');
  });

  test('player joins via join code', async () => {
    const ctx = loadRunContext();
    const joinCode = ctx.joinCodes[1];

    const { status, data } = await playerJoin(joinCode, 'E2E Player 2', `e2e-device-${Date.now()}`);
    expect(status).toBe(200);
    expect(data).toHaveProperty('token');
    expect(data.player).toHaveProperty('id');
    expect(data.team).toHaveProperty('id');
    expect(data).toMatchObject({
      token: expect.any(String),
      player: { id: expect.any(String) },
      team: { id: expect.any(String), name: expect.any(String) },
    });
  });
});
