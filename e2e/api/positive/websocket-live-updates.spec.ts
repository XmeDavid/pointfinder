// @scenarios P26
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
  submitAnswer,
  reviewSubmission,
  getSubmissions,
  sendNotification,
  playerCheckIn,
} from '../../shared/api-client';
import { throwawayGameFixture, baseFixture, challengeFixture, teamFixture } from '../../shared/fixtures';
import { appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken, joinPlayerAndStoreToken } from '../../shared/auth';
import { config } from '../../shared/config';
import { connectToGameTopic, BroadcastEnvelope } from '../../shared/ws-client';

test.describe('P26: WebSocket real-time broadcasts', () => {
  test.describe.configure({ mode: 'serial' });

  let gameId: string;
  let baseId: string;
  let challengeId: string;
  let operatorToken: string;
  let playerToken: string;
  let teamId: string;

  test.beforeAll(async () => {
    operatorToken = getOperatorToken();

    const gameRes = await createGame(operatorToken, throwawayGameFixture(config.runId, 'WebSocket'));
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
    teamId = teamRes.data.id;

    const liveRes = await updateGameStatus(operatorToken, gameId, 'live');
    expect(liveRes.status).toBe(200);

    const joined = await joinPlayerAndStoreToken(teamRes.data.joinCode, 'WsPlayer');
    playerToken = joined.token;
  });

  test.afterAll(async () => {
    await updateGameStatus(operatorToken, gameId, 'ended').catch(() => {});
    await deleteGame(operatorToken, gameId).catch(() => {});
  });

  test('operator receives activity broadcast on player submission', async () => {
    const ws = await connectToGameTopic(gameId, { token: operatorToken });
    try {
      // Wait for subscription to settle
      await new Promise((r) => setTimeout(r, 500));

      // Player checks in and submits
      await playerCheckIn(playerToken, gameId, baseId);
      await submitAnswer(playerToken, gameId, { baseId, challengeId, answer: 'ws-test' });

      // Wait for activity broadcast
      const envelope = await ws.waitForBroadcast('activity', 10_000);
      expect(envelope.version).toBe(1);
      expect(envelope.gameId).toBe(gameId);
      expect(envelope.type).toBe('activity');
      expect(envelope.data).toBeTruthy();
    } finally {
      await ws.disconnect();
    }
  });

  test('operator receives submission_status broadcast on review', async () => {
    const ws = await connectToGameTopic(gameId, { token: operatorToken });
    try {
      await new Promise((r) => setTimeout(r, 500));

      // Find the pending submission
      const subRes = await getSubmissions(operatorToken, gameId);
      expect(subRes.status).toBe(200);
      const pending = subRes.data.find((s: any) => s.status === 'pending');
      expect(pending).toBeTruthy();

      // Review it
      await reviewSubmission(operatorToken, gameId, pending.id, {
        status: 'approved',
        feedback: 'Good job',
        points: 10,
      });

      // Wait for submission_status broadcast
      const envelope = await ws.waitForBroadcast('submission_status', 10_000);
      expect(envelope.type).toBe('submission_status');
      expect(envelope.gameId).toBe(gameId);
    } finally {
      await ws.disconnect();
    }
  });

  test('operator receives leaderboard broadcast after review', async () => {
    const ws = await connectToGameTopic(gameId, { token: operatorToken });
    try {
      await new Promise((r) => setTimeout(r, 500));

      // Review a submission to trigger leaderboard broadcast
      const subsRes = await getSubmissions(operatorToken, gameId);
      const pending = subsRes.data.find((s: any) => s.status === 'pending');
      if (pending) {
        await reviewSubmission(operatorToken, gameId, pending.id, { status: 'approved' });
      } else {
        // Re-review an existing submission to trigger the broadcast
        const any = subsRes.data[0];
        if (any) {
          await reviewSubmission(operatorToken, gameId, any.id, { status: 'approved' });
        }
      }

      const envelope = await ws.waitForBroadcast('leaderboard', 10_000);
      expect(envelope.type).toBe('leaderboard');
      expect(envelope.gameId).toBe(gameId);
    } finally {
      await ws.disconnect();
    }
  });

  test('operator receives notification broadcast', async () => {
    const ws = await connectToGameTopic(gameId, { token: operatorToken });
    try {
      await new Promise((r) => setTimeout(r, 500));

      await sendNotification(operatorToken, gameId, { message: 'WebSocket test notification' });

      const envelope = await ws.waitForBroadcast('notification', 10_000);
      expect(envelope.type).toBe('notification');
      expect(envelope.gameId).toBe(gameId);
    } finally {
      await ws.disconnect();
    }
  });
});
