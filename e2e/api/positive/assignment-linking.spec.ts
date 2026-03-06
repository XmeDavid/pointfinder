// @scenarios P5
import { test, expect } from '@playwright/test';
import {
  createAssignment,
  getAssignments,
  createTeam,
  createGame,
  deleteGame,
  createBase,
  createChallenge,
} from '../../shared/api-client';
import { config } from '../../shared/config';
import { throwawayGameFixture, baseFixture, challengeFixture, teamFixture } from '../../shared/fixtures';
import { appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';

test.describe('assignment linking', () => {
  test.describe.configure({ mode: 'serial' });

  let token: string;
  let gameId: string;
  let bases: string[];
  let challenges: string[];
  let assignmentIds: string[] = [];

  test.beforeAll(async () => {
    token = getOperatorToken();

    const game = await createGame(token, throwawayGameFixture(config.runId, 'P5-assignments'));
    expect(game.status).toBe(201);
    gameId = game.data.id;
    appendCreatedGameId(gameId);

    const base0 = await createBase(token, gameId, baseFixture(0));
    expect(base0.status).toBe(201);
    const base1 = await createBase(token, gameId, baseFixture(1));
    expect(base1.status).toBe(201);
    bases = [base0.data.id, base1.data.id];

    const ch0 = await createChallenge(token, gameId, challengeFixture('text', 0));
    expect(ch0.status).toBe(201);
    const ch1 = await createChallenge(token, gameId, challengeFixture('text', 1));
    expect(ch1.status).toBe(201);
    challenges = [ch0.data.id, ch1.data.id];
  });

  test('create uniform assignment', async () => {
    const { status, data } = await createAssignment(token, gameId, {
      baseId: bases[0],
      challengeId: challenges[0],
    });
    expect(status).toBe(201);
    expect(data).toHaveProperty('id');
    assignmentIds.push(data.id);
  });

  test('create team-specific assignment', async () => {
    const teamRes = await createTeam(token, gameId, { name: teamFixture(0).name });
    expect(teamRes.status).toBe(201);

    const { status, data } = await createAssignment(token, gameId, {
      baseId: bases[1],
      challengeId: challenges[1],
      teamId: teamRes.data.id,
    });
    expect(status).toBe(201);
    expect(data).toHaveProperty('id');
    assignmentIds.push(data.id);
  });

  test('list assignments', async () => {
    const { status, data } = await getAssignments(token, gameId);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    const ids = data.map((a: any) => a.id);
    for (const id of assignmentIds) {
      expect(ids).toContain(id);
    }
  });

  test.afterAll(async () => {
    if (gameId) {
      await deleteGame(token, gameId);
    }
  });
});
