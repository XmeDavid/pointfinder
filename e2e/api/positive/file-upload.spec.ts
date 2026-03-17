// @scenarios P20
import * as fs from 'fs';
import * as path from 'path';
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
  submitAnswerWithFile,
  getSubmissions,
} from '../../shared/api-client';
import { throwawayGameFixture, baseFixture, challengeFixture, teamFixture } from '../../shared/fixtures';
import { appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken, joinPlayerAndStoreToken } from '../../shared/auth';
import { config } from '../../shared/config';

const ARTIFACTS_DIR = path.resolve(__dirname, '..', '..', 'artifacts');
const TEST_FILE_PATH = path.join(ARTIFACTS_DIR, `test-upload-${config.runId}.png`);

// Minimal valid 1x1 pixel PNG (67 bytes)
const MINIMAL_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
  '0000000a49444154789c626000000002000198e1938a0000000049454e44ae426082',
  'hex',
);

test.describe('file upload submission', () => {
  test.describe.configure({ mode: 'serial' });

  let gameId: string;
  let baseId: string;
  let challengeId: string;
  let operatorToken: string;
  let playerToken: string;

  test.beforeAll(async () => {
    operatorToken = getOperatorToken();

    // Create throwaway game
    const gameRes = await createGame(operatorToken, throwawayGameFixture(config.runId, 'FileUpload'));
    expect(gameRes.status).toBe(201);
    gameId = gameRes.data.id;
    appendCreatedGameId(gameId);

    // Create base and NFC-link it
    const baseRes = await createBase(operatorToken, gameId, baseFixture(0));
    expect(baseRes.status).toBe(201);
    baseId = baseRes.data.id;
    await nfcLinkBase(operatorToken, gameId, baseId);

    // Create file-type challenge
    const challengeRes = await createChallenge(operatorToken, gameId, challengeFixture('file', 0));
    expect(challengeRes.status).toBe(201);
    challengeId = challengeRes.data.id;

    // Create assignment
    const assignRes = await createAssignment(operatorToken, gameId, { baseId, challengeId });
    expect(assignRes.status).toBe(201);

    // Create team — join code is on the team
    const teamRes = await createTeam(operatorToken, gameId, teamFixture(0));
    expect(teamRes.status).toBe(201);
    const joinCode: string = teamRes.data.joinCode;

    // Go live
    const liveRes = await updateGameStatus(operatorToken, gameId, 'live');
    expect(liveRes.status).toBe(200);

    // Join player via team join code
    const joined = await joinPlayerAndStoreToken(joinCode, 'FileUploadPlayer');
    playerToken = joined.token;

    // Check in at base before submitting
    const checkIn = await playerCheckIn(playerToken, gameId, baseId);
    expect(checkIn.status).toBe(200);

    // Create the test file to upload
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    fs.writeFileSync(TEST_FILE_PATH, MINIMAL_PNG);
  });

  test.afterAll(async () => {
    if (fs.existsSync(TEST_FILE_PATH)) {
      fs.unlinkSync(TEST_FILE_PATH);
    }
    await updateGameStatus(operatorToken, gameId, 'ended').catch(() => {});
    await deleteGame(operatorToken, gameId).catch(() => {});
  });

  // P20
  test('player submits file upload and operator sees it with fileUrl', async () => {
    const { status, data } = await submitAnswerWithFile(playerToken, gameId, {
      baseId,
      challengeId,
      filePath: TEST_FILE_PATH,
    });

    expect(status).toBe(201);
    expect(data).toHaveProperty('id');
    expect(data.status).toBe('pending');

    // Operator verifies submission appears with file info
    const subRes = await getSubmissions(operatorToken, gameId);
    expect(subRes.status).toBe(200);
    expect(Array.isArray(subRes.data)).toBe(true);

    const submission = subRes.data.find((s: any) => s.id === data.id);
    expect(submission).toBeDefined();

    const hasFile =
      submission.fileUrl != null ||
      (Array.isArray(submission.fileUrls) && submission.fileUrls.length > 0);
    expect(hasFile).toBe(true);
  });
});
