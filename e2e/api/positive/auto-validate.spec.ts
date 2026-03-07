// @scenarios P21, P24
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
} from '../../shared/api-client';
import {
  throwawayGameFixture,
  baseFixture,
  autoValidateChallengeFixture,
  teamFixture,
} from '../../shared/fixtures';
import { appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken, joinPlayerAndStoreToken } from '../../shared/auth';
import { waitForLeaderboardUpdate } from '../../shared/wait-helpers';
import { config } from '../../shared/config';

test.describe('auto-validate challenge', () => {
  test.describe.configure({ mode: 'serial' });

  let gameId: string;
  let baseId: string;
  let challengeId: string;
  let base2Id: string;
  let challenge2Id: string;
  let operatorToken: string;
  let playerToken: string;
  let teamId: string;

  test.beforeAll(async () => {
    operatorToken = getOperatorToken();

    // Create throwaway game
    const gameRes = await createGame(operatorToken, throwawayGameFixture(config.runId, 'AutoValidate'));
    expect(gameRes.status).toBe(201);
    gameId = gameRes.data.id;
    appendCreatedGameId(gameId);

    // Base 1 + auto-validate challenge 1
    const baseRes = await createBase(operatorToken, gameId, baseFixture(0));
    expect(baseRes.status).toBe(201);
    baseId = baseRes.data.id;
    await nfcLinkBase(operatorToken, gameId, baseId);

    const challengeRes = await createChallenge(operatorToken, gameId, autoValidateChallengeFixture(0));
    expect(challengeRes.status).toBe(201);
    challengeId = challengeRes.data.id;

    await createAssignment(operatorToken, gameId, { baseId, challengeId });

    // Base 2 + auto-validate challenge 2 (for wrong-answer test P24)
    const base2Res = await createBase(operatorToken, gameId, baseFixture(1));
    expect(base2Res.status).toBe(201);
    base2Id = base2Res.data.id;
    await nfcLinkBase(operatorToken, gameId, base2Id);

    const challenge2Res = await createChallenge(operatorToken, gameId, autoValidateChallengeFixture(1));
    expect(challenge2Res.status).toBe(201);
    challenge2Id = challenge2Res.data.id;

    await createAssignment(operatorToken, gameId, { baseId: base2Id, challengeId: challenge2Id });

    // Create team and get join code
    const teamRes = await createTeam(operatorToken, gameId, teamFixture(0));
    expect(teamRes.status).toBe(201);
    teamId = teamRes.data.id;
    const joinCode: string = teamRes.data.joinCode;

    // Go live
    const liveRes = await updateGameStatus(operatorToken, gameId, 'live');
    expect(liveRes.status).toBe(200);

    // Join player
    const joined = await joinPlayerAndStoreToken(joinCode, 'AutoValidatePlayer');
    playerToken = joined.token;

    // Check in at both bases upfront
    await playerCheckIn(playerToken, gameId, baseId);
    await playerCheckIn(playerToken, gameId, base2Id);
  });

  test.afterAll(async () => {
    await updateGameStatus(operatorToken, gameId, 'ended').catch(() => {});
    await deleteGame(operatorToken, gameId).catch(() => {});
  });

  // P21: correct answer → auto-approved, leaderboard updates
  test('P21: correct answer is auto-validated and leaderboard shows points', async () => {
    const { status, data } = await submitAnswer(playerToken, gameId, {
      baseId,
      challengeId,
      answer: 'correct answer',
    });

    expect(status).toBe(201);
    expect(data).toHaveProperty('id');
    expect(data.status).toBe('correct');

    // Leaderboard should reflect 15 points (autoValidateChallengeFixture points)
    await waitForLeaderboardUpdate(operatorToken, gameId, teamId, 15);
  });

  // P24: wrong answer → auto-rejected
  test('P24: wrong answer is auto-rejected', async () => {
    const { status, data } = await submitAnswer(playerToken, gameId, {
      baseId: base2Id,
      challengeId: challenge2Id,
      answer: 'wrong answer',
    });

    expect(status).toBe(201);
    expect(data).toHaveProperty('id');
    expect(data.status).toBe('rejected');
  });
});
