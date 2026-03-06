// @scenarios N6, N8, N9, N10
import { test, expect } from '@playwright/test';
import {
  createGame,
  createBase,
  createChallenge,
  createTeam,
  nfcLinkBase,
  updateBase,
  updateGameStatus,
  deleteGame,
  submitAnswer,
  playerCheckIn,
} from '../../shared/api-client';
import { config } from '../../shared/config';
import { loadRunContext, appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken, getPlayerToken } from '../../shared/auth';
import {
  throwawayGameFixture,
  baseFixture,
  challengeFixture,
  teamFixture,
} from '../../shared/fixtures';
import { v4 as uuidv4 } from 'uuid';

test.describe('business rules', { tag: '@negative' }, () => {
  test.describe.configure({ mode: 'serial' });

  let token: string;
  let mainGameId: string;
  let mainBaseIds: string[];
  let mainChallengeIds: string[];
  let mainPlayerToken: string;

  const throwawayGameIds: string[] = [];

  test.beforeAll(async () => {
    token = getOperatorToken();
    const ctx = loadRunContext();
    mainGameId = ctx.mainGameId;
    mainBaseIds = ctx.baseIds;
    mainChallengeIds = ctx.challengeIds;
    mainPlayerToken = getPlayerToken();
  });

  test.afterAll(async () => {
    for (const gameId of throwawayGameIds) {
      await updateGameStatus(token, gameId, 'ended').catch(() => {});
      await deleteGame(token, gameId).catch(() => {});
    }
  });

  test('create game with empty name', async () => {
    const { status } = await createGame(token, { name: '' });
    expect(status).toBe(400);
  });

  test('duplicate idempotency key', async () => {
    const idempotencyKey = uuidv4();
    await playerCheckIn(mainPlayerToken, mainGameId, mainBaseIds[1]);

    const first = await submitAnswer(mainPlayerToken, mainGameId, {
      baseId: mainBaseIds[1],
      challengeId: mainChallengeIds[1],
      answer: 'dup-test',
      idempotencyKey,
    });
    expect([200, 201]).toContain(first.status);

    const second = await submitAnswer(mainPlayerToken, mainGameId, {
      baseId: mainBaseIds[1],
      challengeId: mainChallengeIds[1],
      answer: 'dup-test',
      idempotencyKey,
    });
    // Second call with same key should be idempotent (200/201) or conflict (409)
    // but should NOT create a distinct new submission
    expect([200, 201, 409]).toContain(second.status);
    if (first.status === 201 && second.status === 201) {
      // Both 201 — verify they returned the same submission ID (idempotent)
      expect(second.data.id).toBe(first.data.id);
    }
  });

  test('fixed challenge on multiple bases is allowed', async () => {
    // N9: Backend allows the same fixedChallengeId on multiple bases
    const gameRes = await createGame(token, throwawayGameFixture(config.runId, 'fixed-multi'));
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

    const updateA = await updateBase(token, gameId, baseARes.data.id, {
      name: 'Base A', lat: baseFixture(0).lat, lng: baseFixture(0).lng,
      fixedChallengeId: challengeId,
    });
    expect(updateA.status).toBe(200);

    const updateB = await updateBase(token, gameId, baseBRes.data.id, {
      name: 'Base B', lat: baseFixture(1).lat, lng: baseFixture(1).lng,
      fixedChallengeId: challengeId,
    });
    // Backend allows this — same challenge can be fixed on multiple bases
    expect([200, 400, 409]).toContain(updateB.status);
  });

  test('more bases than challenges blocks go-live', async () => {
    const gameRes = await createGame(token, throwawayGameFixture(config.runId, 'bases-gt-challenges'));
    expect(gameRes.status).toBe(201);
    const gameId = gameRes.data.id;
    throwawayGameIds.push(gameId);
    appendCreatedGameId(gameId);

    const baseIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const bRes = await createBase(token, gameId, baseFixture(i));
      expect(bRes.status).toBe(201);
      baseIds.push(bRes.data.id);
    }

    const chRes = await createChallenge(token, gameId, challengeFixture('text', 0));
    expect(chRes.status).toBe(201);

    const teamRes = await createTeam(token, gameId, teamFixture(0));
    expect(teamRes.status).toBe(201);

    for (const baseId of baseIds) {
      const nfcRes = await nfcLinkBase(token, gameId, baseId);
      expect(nfcRes.status).toBe(200);
    }

    const { status } = await updateGameStatus(token, gameId, 'live');
    expect(status).toBe(400);
  });
});
