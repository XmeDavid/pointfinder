// @scenarios P23, N13
import { v4 as uuidv4 } from 'uuid';
import { test, expect } from '@playwright/test';
import {
  createGame,
  createBase,
  nfcLinkBase,
  createChallenge,
  createAssignment,
  createTeam,
  updateGameStatus,
  deleteGame,
  playerCheckIn,
  submitAnswer,
  getSubmissions,
} from '../../shared/api-client';
import { throwawayGameFixture, baseFixture, challengeFixture, teamFixture } from '../../shared/fixtures';
import { appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken, joinPlayerAndStoreToken } from '../../shared/auth';
import { config } from '../../shared/config';

// P23: 6 players submit simultaneously
test.describe('P23: concurrent submissions', () => {
  test.describe.configure({ mode: 'serial' });

  let gameId: string;
  let baseId: string;
  let challengeId: string;
  let operatorToken: string;
  let playerTokens: string[] = [];

  test.beforeAll(async () => {
    operatorToken = getOperatorToken();

    const gameRes = await createGame(operatorToken, throwawayGameFixture(config.runId, 'Concurrent'));
    expect(gameRes.status).toBe(201);
    gameId = gameRes.data.id;
    appendCreatedGameId(gameId);

    const baseRes = await createBase(operatorToken, gameId, baseFixture(0));
    expect(baseRes.status).toBe(201);
    baseId = baseRes.data.id;
    await nfcLinkBase(operatorToken, gameId, baseId);

    const challengeRes = await createChallenge(operatorToken, gameId, challengeFixture('text', 0));
    expect(challengeRes.status).toBe(201);
    challengeId = challengeRes.data.id;

    await createAssignment(operatorToken, gameId, { baseId, challengeId });

    // Create 6 teams and join one player per team
    const joinCodes: string[] = [];
    for (let i = 0; i < 6; i++) {
      const teamRes = await createTeam(operatorToken, gameId, teamFixture(i));
      expect(teamRes.status).toBe(201);
      joinCodes.push(teamRes.data.joinCode);
    }

    // Go live
    const liveRes = await updateGameStatus(operatorToken, gameId, 'live');
    expect(liveRes.status).toBe(200);

    // Join all 6 players
    for (let i = 0; i < 6; i++) {
      const joined = await joinPlayerAndStoreToken(joinCodes[i], `ConcurrentPlayer${i}`);
      playerTokens.push(joined.token);
    }
  });

  test.afterAll(async () => {
    await updateGameStatus(operatorToken, gameId, 'ended').catch(() => {});
    await deleteGame(operatorToken, gameId).catch(() => {});
  });

  test('P23: all 6 players check in and submit simultaneously', async () => {
    // All 6 check in concurrently
    const checkInResults = await Promise.all(
      playerTokens.map((token) => playerCheckIn(token, gameId, baseId)),
    );
    for (const r of checkInResults) {
      expect(r.status).toBe(200);
    }

    // All 6 submit simultaneously
    const submitResults = await Promise.all(
      playerTokens.map((token) =>
        submitAnswer(token, gameId, {
          baseId,
          challengeId,
          answer: 'my answer',
        }),
      ),
    );
    for (const r of submitResults) {
      expect(r.status).toBe(201);
    }

    // Operator sees exactly 6 submissions
    const subRes = await getSubmissions(operatorToken, gameId);
    expect(subRes.status).toBe(200);
    expect(Array.isArray(subRes.data)).toBe(true);
    expect(subRes.data.length).toBe(6);
  });
});

// N13: idempotency key prevents duplicate submissions
test.describe('N13: idempotency key deduplication', () => {
  test.describe.configure({ mode: 'serial' });

  let gameId: string;
  let baseId: string;
  let challengeId: string;
  let operatorToken: string;
  let playerToken: string;

  test.beforeAll(async () => {
    operatorToken = getOperatorToken();

    const gameRes = await createGame(operatorToken, throwawayGameFixture(config.runId, 'Idempotency'));
    expect(gameRes.status).toBe(201);
    gameId = gameRes.data.id;
    appendCreatedGameId(gameId);

    const baseRes = await createBase(operatorToken, gameId, baseFixture(0));
    expect(baseRes.status).toBe(201);
    baseId = baseRes.data.id;
    await nfcLinkBase(operatorToken, gameId, baseId);

    const challengeRes = await createChallenge(operatorToken, gameId, challengeFixture('text', 0));
    expect(challengeRes.status).toBe(201);
    challengeId = challengeRes.data.id;

    await createAssignment(operatorToken, gameId, { baseId, challengeId });

    const teamRes = await createTeam(operatorToken, gameId, teamFixture(0));
    expect(teamRes.status).toBe(201);
    const joinCode: string = teamRes.data.joinCode;

    const liveRes = await updateGameStatus(operatorToken, gameId, 'live');
    expect(liveRes.status).toBe(200);

    const joined = await joinPlayerAndStoreToken(joinCode, 'IdempotencyPlayer');
    playerToken = joined.token;

    await playerCheckIn(playerToken, gameId, baseId);
  });

  test.afterAll(async () => {
    await updateGameStatus(operatorToken, gameId, 'ended').catch(() => {});
    await deleteGame(operatorToken, gameId).catch(() => {});
  });

  test('N13: duplicate submission with same idempotency key is deduplicated', async () => {
    const idempotencyKey = uuidv4();
    const payload = { baseId, challengeId, answer: 'idempotent answer', idempotencyKey };

    // First submission
    const first = await submitAnswer(playerToken, gameId, payload);
    expect(first.status).toBe(201);
    expect(first.data).toHaveProperty('id');
    const firstId = first.data.id;

    // Second submission with same key — must return 201 with same id OR 409
    const second = await submitAnswer(playerToken, gameId, payload);
    expect([201, 409]).toContain(second.status);
    if (second.status === 201) {
      expect(second.data.id).toBe(firstId);
    }

    // Operator sees exactly 1 submission
    const subRes = await getSubmissions(operatorToken, gameId);
    expect(subRes.status).toBe(200);
    expect(Array.isArray(subRes.data)).toBe(true);
    expect(subRes.data.length).toBe(1);
  });
});
