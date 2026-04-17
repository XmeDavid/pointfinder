// @scenarios P29, N15
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
} from '../../shared/api-client';
import {
  throwawayGameFixture,
  baseFixture,
  teamFixture,
} from '../../shared/fixtures';
import { appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken, joinPlayerAndStoreToken } from '../../shared/auth';
import { config } from '../../shared/config';

/**
 * Wave E.1 — cross-cutting smoke covering Wave A backend readiness.
 *
 * Covers two behaviours introduced by the variable autocomplete /
 * auto-validation UX wave:
 *
 *  1. Per-team auto-validation: a challenge whose correctAnswer contains
 *     `{{secret}}` resolves to a different expected value for each team,
 *     so the same literal answer passes for one team and is auto-rejected
 *     for another.
 *
 *  2. Go-live rejection with `VARIABLE_REFERENCE_UNDEFINED` when a challenge
 *     references a key that has no value defined for every team.
 */

// ── Helpers local to this spec ──────────────────────────────────────────────

async function saveGameVariables(
  token: string,
  gameId: string,
  entries: Array<{ key: string; teamValues: Record<string, string> }>,
): Promise<{ status: number }> {
  const res = await fetch(`${config.baseUrl}/api/games/${gameId}/team-variables`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ variables: entries }),
  });
  return { status: res.status };
}

/**
 * Player check-in that carries the NFC verification token. The shared
 * `playerCheckIn` helper in {@code api-client.ts} is a pre-NFC-gate
 * legacy signature; the backend now requires {@code nfcToken} on every
 * check-in (ErrorCode NFC_TOKEN_REQUIRED). We pass the operator-facing
 * {@code BaseResponse.nfcToken} through directly.
 */
async function playerCheckInWithToken(
  playerToken: string,
  gameId: string,
  baseId: string,
  nfcToken: string,
): Promise<{ status: number; data: any }> {
  const res = await fetch(
    `${config.baseUrl}/api/player/games/${gameId}/bases/${baseId}/check-in`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${playerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ nfcToken }),
    },
  );
  const data = res.status === 204 ? undefined : await res.json();
  return { status: res.status, data };
}

// ── Test 1: per-team auto-validation ────────────────────────────────────────

test.describe('variable auto-validation (per-team resolution)', () => {
  test.describe.configure({ mode: 'serial' });

  let operatorToken: string;
  let gameId: string;
  let baseId: string;
  let baseNfcToken: string;
  let challengeId: string;
  let teamAId: string;
  let teamBId: string;
  let playerAToken: string;
  let playerBToken: string;

  test.beforeAll(async () => {
    operatorToken = getOperatorToken();

    // Create throwaway game
    const gameRes = await createGame(
      operatorToken,
      throwawayGameFixture(config.runId, 'VarAutoValidate'),
    );
    expect(gameRes.status).toBe(201);
    gameId = gameRes.data.id;
    appendCreatedGameId(gameId);

    // Single base with NFC tag
    const baseRes = await createBase(operatorToken, gameId, baseFixture(0));
    expect(baseRes.status).toBe(201);
    baseId = baseRes.data.id;
    const linkRes = await nfcLinkBase(operatorToken, gameId, baseId);
    expect(linkRes.status).toBe(200);
    baseNfcToken = linkRes.data.nfcToken;
    expect(typeof baseNfcToken).toBe('string');
    expect(baseNfcToken.length).toBeGreaterThan(0);

    // Auto-validate text challenge whose correctAnswer references {{secret}}
    const challengeRes = await createChallenge(operatorToken, gameId, {
      title: 'Find the Secret',
      description: 'E2E {{secret}} challenge',
      answerType: 'text',
      points: 10,
      autoValidate: true,
      correctAnswer: ['{{secret}}'],
    });
    expect(challengeRes.status).toBe(201);
    challengeId = challengeRes.data.id;

    await createAssignment(operatorToken, gameId, { baseId, challengeId });

    // Two teams, each with its own secret
    const teamARes = await createTeam(operatorToken, gameId, teamFixture(0));
    expect(teamARes.status).toBe(201);
    teamAId = teamARes.data.id;
    const teamAJoinCode: string = teamARes.data.joinCode;

    const teamBRes = await createTeam(operatorToken, gameId, teamFixture(1));
    expect(teamBRes.status).toBe(201);
    teamBId = teamBRes.data.id;
    const teamBJoinCode: string = teamBRes.data.joinCode;

    // Define the per-team value for {{secret}}
    const varsRes = await saveGameVariables(operatorToken, gameId, [
      {
        key: 'secret',
        teamValues: {
          [teamAId]: 'FOX',
          [teamBId]: 'WOLF',
        },
      },
    ]);
    expect(varsRes.status).toBe(200);

    // Go live
    const liveRes = await updateGameStatus(operatorToken, gameId, 'live');
    expect(liveRes.status).toBe(200);

    // Each team joins a player and checks in (requires the operator-facing
    // nfcToken; see `playerCheckInWithToken` above).
    const joinedA = await joinPlayerAndStoreToken(teamAJoinCode, 'VarPlayerA');
    playerAToken = joinedA.token;
    const ciA = await playerCheckInWithToken(playerAToken, gameId, baseId, baseNfcToken);
    expect(ciA.status).toBe(200);

    const joinedB = await joinPlayerAndStoreToken(teamBJoinCode, 'VarPlayerB');
    playerBToken = joinedB.token;
    const ciB = await playerCheckInWithToken(playerBToken, gameId, baseId, baseNfcToken);
    expect(ciB.status).toBe(200);
  });

  test.afterAll(async () => {
    if (gameId) {
      await updateGameStatus(operatorToken, gameId, 'ended').catch(() => {});
      await deleteGame(operatorToken, gameId).catch(() => {});
    }
  });

  // P29: per-team auto-validation
  //
  // NOTE: the backend de-duplicates auto-resolved submissions for a given
  // (team, challenge, base) triple without an idempotency key — a second
  // `correct` submission returns the first one on record (SubmissionService
  // `findByTeamIdAndChallengeIdAndBaseId` early-return). To exercise both
  // branches on team B we pass unique idempotency keys per attempt so each
  // submission is recorded with its own resolved status.
  test('per-team auto-validation resolves {{secret}} uniquely per team', async () => {
    // Team A submits FOX (their secret) → correct
    const a = await submitAnswer(playerAToken, gameId, {
      baseId,
      challengeId,
      answer: 'FOX',
      idempotencyKey: crypto.randomUUID(),
    });
    expect(a.status).toBe(201);
    expect(a.data.status).toBe('correct');

    // Team B submits FOX (team A's secret, not theirs) → rejected
    const b1 = await submitAnswer(playerBToken, gameId, {
      baseId,
      challengeId,
      answer: 'FOX',
      idempotencyKey: crypto.randomUUID(),
    });
    expect(b1.status).toBe(201);
    expect(b1.data.status).toBe('rejected');

    // Team B submits WOLF (their own secret) → correct
    const b2 = await submitAnswer(playerBToken, gameId, {
      baseId,
      challengeId,
      answer: 'WOLF',
      idempotencyKey: crypto.randomUUID(),
    });
    expect(b2.status).toBe(201);
    expect(b2.data.status).toBe('correct');
  });
});

// ── Test 2: go-live rejects undefined variable reference ───────────────────

test.describe('go-live variable reference guard', { tag: '@negative' }, () => {
  test.describe.configure({ mode: 'serial' });

  let operatorToken: string;
  let gameId: string;

  test.beforeAll(async () => {
    operatorToken = getOperatorToken();

    const gameRes = await createGame(
      operatorToken,
      throwawayGameFixture(config.runId, 'VarUndefinedKey'),
    );
    expect(gameRes.status).toBe(201);
    gameId = gameRes.data.id;
    appendCreatedGameId(gameId);

    // Base + NFC so the readiness checks don't trip on missing NFC instead.
    const baseRes = await createBase(operatorToken, gameId, baseFixture(0));
    expect(baseRes.status).toBe(201);
    const baseId = baseRes.data.id;
    await nfcLinkBase(operatorToken, gameId, baseId);

    // Challenge referencing a key that is never defined for the team.
    // The backend scans `content`, `completionContent`, and each
    // `correctAnswer` entry for `{{key}}` references — not `description` —
    // so we embed the undefined key inside `correctAnswer` to trip the
    // completeness check deterministically.
    const challengeRes = await createChallenge(operatorToken, gameId, {
      title: 'Undefined Key Challenge',
      description: 'Plain description with no references',
      answerType: 'text',
      points: 10,
      autoValidate: true,
      correctAnswer: ['{{undefined_key}}'],
    });
    expect(challengeRes.status).toBe(201);
    await createAssignment(operatorToken, gameId, {
      baseId,
      challengeId: challengeRes.data.id,
    });

    // One team — ensures the variable completeness check has someone to
    // resolve against (the check short-circuits when there are no teams).
    const teamRes = await createTeam(operatorToken, gameId, teamFixture(0));
    expect(teamRes.status).toBe(201);
  });

  test.afterAll(async () => {
    if (gameId) {
      await updateGameStatus(operatorToken, gameId, 'ended').catch(() => {});
      await deleteGame(operatorToken, gameId).catch(() => {});
    }
  });

  // N15: go-live rejects undefined {{key}} reference
  test('go-live rejects game with undefined {{key}} in challenge', async () => {
    const { status, data } = await updateGameStatus(operatorToken, gameId, 'live');
    expect(status).toBe(400);
    expect(data.code).toBe('VARIABLE_REFERENCE_UNDEFINED');
    // Sanity: error message mentions the team-variables completeness check.
    expect(typeof data.message).toBe('string');
    expect(data.message.toLowerCase()).toContain('team variables');
  });
});
