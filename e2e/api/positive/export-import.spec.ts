// @scenarios P16
import { test, expect } from '@playwright/test';
import {
  exportGame,
  importGame,
  deleteGame,
  updateGameStatus,
  getBases,
  getChallenges,
} from '../../shared/api-client';
import { loadRunContext, appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';

test.describe('Export / Import - positive', () => {
  test.describe.configure({ mode: 'serial' });

  let token: string;
  let mainGameId: string;
  let exportData: unknown;
  let originalBaseCount: number;
  let originalChallengeCount: number;
  let importedGameId: string;

  test.beforeAll(async () => {
    const ctx = loadRunContext();
    mainGameId = ctx.mainGameId;
    token = getOperatorToken();
  });

  test('P16: export game', async () => {
    const { status, data } = await exportGame(token, mainGameId);
    expect(status).toBe(200);
    expect(data).toBeDefined();
    expect(data).toHaveProperty('bases');
    expect(data).toHaveProperty('challenges');
    expect(Array.isArray(data.bases)).toBe(true);
    expect(Array.isArray(data.challenges)).toBe(true);
    exportData = data;
    originalBaseCount = data.bases.length;
    originalChallengeCount = data.challenges.length;
  });

  test('P16: import game as new', async () => {
    const { status, data } = await importGame(token, exportData);
    expect(status).toBe(201);
    expect(data).toHaveProperty('id');
    importedGameId = data.id;
    appendCreatedGameId(importedGameId);
  });

  test('P16: imported game has same structure', async () => {
    const basesRes = await getBases(token, importedGameId);
    expect(basesRes.status).toBe(200);
    expect(Array.isArray(basesRes.data)).toBe(true);
    expect(basesRes.data.length).toBe(originalBaseCount);

    const challengesRes = await getChallenges(token, importedGameId);
    expect(challengesRes.status).toBe(200);
    expect(Array.isArray(challengesRes.data)).toBe(true);
    expect(challengesRes.data.length).toBe(originalChallengeCount);
  });

  test.afterAll(async () => {
    if (!importedGameId) return;
    // Transition to ended before deletion if needed
    await updateGameStatus(token, importedGameId, 'ended');
    await deleteGame(token, importedGameId);
  });
});
