// @scenarios N3, N4
import { test, expect } from '@playwright/test';
import {
  createGame,
  createBase,
  createChallenge,
  createAssignment,
  createTeam,
  nfcLinkBase,
  updateGameStatus,
  deleteGame,
  playerJoin,
  playerCheckIn,
  submitAnswer,
  getProgress,
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

test.describe('player isolation', { tag: '@negative' }, () => {
  test.describe.configure({ mode: 'serial' });

  let token: string;
  let mainGameId: string;
  let mainBaseIds: string[];
  let mainChallengeIds: string[];
  let mainPlayerToken: string;

  let throwawayGameId: string;
  let throwawayPlayerToken: string;

  test.beforeAll(async () => {
    const ctx = loadRunContext();
    mainGameId = ctx.mainGameId;
    mainBaseIds = ctx.baseIds;
    mainChallengeIds = ctx.challengeIds;
    token = getOperatorToken();
    mainPlayerToken = getPlayerToken();

    // Create throwaway game with full setup
    const gameRes = await createGame(token, throwawayGameFixture(config.runId, 'isolation'));
    if (gameRes.status !== 201) throw new Error(`Create game failed: ${gameRes.status}`);
    throwawayGameId = gameRes.data.id;
    appendCreatedGameId(throwawayGameId);

    const baseRes = await createBase(token, throwawayGameId, baseFixture(0));
    if (baseRes.status !== 201) throw new Error(`Create base failed: ${baseRes.status}`);

    await nfcLinkBase(token, throwawayGameId, baseRes.data.id);

    const chRes = await createChallenge(token, throwawayGameId, challengeFixture('text', 0));
    if (chRes.status !== 201) throw new Error(`Create challenge failed: ${chRes.status}`);

    await createAssignment(token, throwawayGameId, {
      baseId: baseRes.data.id,
      challengeId: chRes.data.id,
    });

    const teamRes = await createTeam(token, throwawayGameId, teamFixture(0));
    if (teamRes.status !== 201) throw new Error(`Create team failed: ${teamRes.status}`);

    const liveRes = await updateGameStatus(token, throwawayGameId, 'live');
    if (liveRes.status !== 200) throw new Error(`Go live failed: ${liveRes.status}`);

    // Join player using team's joinCode
    const joinRes = await playerJoin(teamRes.data.joinCode, 'IsolationPlayer', `device-iso-${Date.now()}`);
    if (joinRes.status !== 200) throw new Error(`Player join failed: ${joinRes.status}`);
    throwawayPlayerToken = joinRes.data.token;
  });

  test.afterAll(async () => {
    if (throwawayGameId) {
      await updateGameStatus(token, throwawayGameId, 'ended').catch(() => {});
      await deleteGame(token, throwawayGameId).catch(() => {});
    }
  });

  test('player cannot access different game', async () => {
    const { status } = await getProgress(throwawayPlayerToken, mainGameId);
    expect([403, 404]).toContain(status);
  });

  test('player cannot submit to unassigned challenge', async () => {
    const unassignedChallengeId = mainChallengeIds[mainChallengeIds.length - 1];
    await playerCheckIn(mainPlayerToken, mainGameId, mainBaseIds[0]);

    const { status } = await submitAnswer(mainPlayerToken, mainGameId, {
      baseId: mainBaseIds[0],
      challengeId: unassignedChallengeId,
      answer: 'test-answer',
    });
    expect([400, 403]).toContain(status);
  });
});
