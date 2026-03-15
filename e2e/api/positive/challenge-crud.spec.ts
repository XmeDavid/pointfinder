// @scenarios P4, P13, P14, P25
import { test, expect } from '@playwright/test';
import {
  createGame,
  deleteGame,
  createChallenge,
  getChallenges,
  updateChallenge,
  deleteChallenge,
} from '../../shared/api-client';
import { config } from '../../shared/config';
import { throwawayGameFixture, challengeFixture } from '../../shared/fixtures';
import { appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';

test.describe('Challenge CRUD - positive', () => {
  test.describe.configure({ mode: 'serial' });

  let token: string;
  let gameId: string;
  let challengeId: string;

  test.beforeAll(async () => {
    token = getOperatorToken();

    const gameRes = await createGame(token, throwawayGameFixture(config.runId, 'challenge-crud'));
    expect(gameRes.status).toBe(201);
    gameId = gameRes.data.id;
    appendCreatedGameId(gameId);
  });

  test.afterAll(async () => {
    if (gameId) {
      await deleteGame(token, gameId);
    }
  });

  test('P4: create text challenge', async () => {
    const { status, data } = await createChallenge(token, gameId, challengeFixture('text', 0));
    expect(status).toBe(201);
    expect(data).toHaveProperty('id');
    expect(data.answerType).toBe('text');
    challengeId = data.id;
  });

  test('P4: create file challenge', async () => {
    const { status, data } = await createChallenge(token, gameId, challengeFixture('file', 1));
    expect(status).toBe(201);
    expect(data).toHaveProperty('id');
    expect(data.answerType).toBe('file');
  });

  test('P25: create challenge with requirePresenceToSubmit', async () => {
    const { status, data } = await createChallenge(token, gameId, {
      ...challengeFixture('text', 10),
      requirePresenceToSubmit: true,
    });
    expect(status).toBe(201);
    expect(data).toHaveProperty('id');
    expect(data.requirePresenceToSubmit).toBe(true);

    // Verify it persists when fetched via list
    const listRes = await getChallenges(token, gameId);
    expect(listRes.status).toBe(200);
    const fetched = listRes.data.find((c: any) => c.id === data.id);
    expect(fetched).toBeDefined();
    expect(fetched.requirePresenceToSubmit).toBe(true);
  });

  test('P13: update challenge title', async () => {
    const newTitle = 'Challenge Updated';
    const updateRes = await updateChallenge(token, gameId, challengeId, {
      title: newTitle,
      answerType: 'text',
      points: 10,
    });
    expect(updateRes.status).toBe(200);

    const { status, data } = await getChallenges(token, gameId);
    expect(status).toBe(200);
    const updated = data.find((c: any) => c.id === challengeId);
    expect(updated).toBeDefined();
    expect(updated.title).toBe(newTitle);
  });

  test('P14: delete challenge', async () => {
    const createRes = await createChallenge(token, gameId, challengeFixture('text', 2));
    expect(createRes.status).toBe(201);
    const deletedChallengeId = createRes.data.id;

    const deleteRes = await deleteChallenge(token, gameId, deletedChallengeId);
    expect(deleteRes.status).toBe(204);

    const { status, data } = await getChallenges(token, gameId);
    expect(status).toBe(200);
    const found = data.find((c: any) => c.id === deletedChallengeId);
    expect(found).toBeUndefined();
  });
});
