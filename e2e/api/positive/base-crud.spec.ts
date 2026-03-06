// @scenarios P3, P13, P14
import { test, expect } from '@playwright/test';
import {
  createGame,
  deleteGame,
  createBase,
  getBases,
  updateBase,
  deleteBase,
} from '../../shared/api-client';
import { config } from '../../shared/config';
import { throwawayGameFixture, baseFixture } from '../../shared/fixtures';
import { loadRunContext, appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';

test.describe('Base CRUD - positive', () => {
  test.describe.configure({ mode: 'serial' });

  let token: string;
  let gameId: string;
  let baseId: string;

  test.beforeAll(async () => {
    token = getOperatorToken();

    const gameRes = await createGame(token, throwawayGameFixture(config.runId, 'base-crud'));
    expect(gameRes.status).toBe(201);
    gameId = gameRes.data.id;
    appendCreatedGameId(gameId);
  });

  test.afterAll(async () => {
    if (gameId) {
      await deleteGame(token, gameId);
    }
  });

  test('P3: create base', async () => {
    const { status, data } = await createBase(token, gameId, baseFixture(0));
    expect(status).toBe(201);
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('name');
    expect(data).toHaveProperty('lat');
    expect(data).toHaveProperty('lng');
    baseId = data.id;
  });

  test('P13: update base name', async () => {
    const newName = 'Base Updated';
    const updateRes = await updateBase(token, gameId, baseId, {
      name: newName,
      lat: 38.7223,
      lng: -9.1393,
    });
    expect(updateRes.status).toBe(200);

    const { status, data } = await getBases(token, gameId);
    expect(status).toBe(200);
    const updated = data.find((b: any) => b.id === baseId);
    expect(updated).toBeDefined();
    expect(updated.name).toBe(newName);
  });

  test('P14: delete base', async () => {
    const createRes = await createBase(token, gameId, baseFixture(1));
    expect(createRes.status).toBe(201);
    const deletedBaseId = createRes.data.id;

    const deleteRes = await deleteBase(token, gameId, deletedBaseId);
    expect(deleteRes.status).toBe(204);

    const { status, data } = await getBases(token, gameId);
    expect(status).toBe(200);
    const found = data.find((b: any) => b.id === deletedBaseId);
    expect(found).toBeUndefined();
  });

  test('main game bases are untouched', async () => {
    const ctx = loadRunContext();
    const { status, data } = await getBases(token, ctx.mainGameId);
    expect(status).toBe(200);
    expect(data.length).toBe(ctx.baseIds.length);
  });
});
