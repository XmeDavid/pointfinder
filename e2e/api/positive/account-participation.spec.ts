// PF-01 / PF-02: a guest saves progress to an account and gets it back on a second device.
import { test, expect } from '@playwright/test';
import {
  createGame,
  createTeam,
  deleteGame,
  playerAccount,
  playerJoin,
  playerLinkAccount,
  playerRecover,
} from '../../shared/api-client';
import { config } from '../../shared/config';
import { throwawayGameFixture } from '../../shared/fixtures';
import { appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';

test.describe('account participation', () => {
  test.describe.configure({ mode: 'serial' });

  let token: string;
  let gameId: string;
  let falconsCode: string;
  let owlsCode: string;
  const email = `e2e-${config.runId}@example.test`;
  const password = 'Secret123';
  let guest: { token: string; playerId: string };

  test.beforeAll(async () => {
    token = getOperatorToken();
    const game = await createGame(token, throwawayGameFixture(config.runId, 'account'));
    if (game.status !== 201) throw new Error(`Create game failed: ${game.status}`);
    gameId = game.data.id;
    appendCreatedGameId(gameId);
    const falcons = await createTeam(token, gameId, { name: 'Falcons' });
    const owls = await createTeam(token, gameId, { name: 'Owls' });
    falconsCode = falcons.data.joinCode;
    owlsCode = owls.data.joinCode;
  });

  test.afterAll(async () => {
    if (gameId) await deleteGame(token, gameId);
  });

  test('a guest joins and is not linked to any account', async () => {
    const joined = await playerJoin(falconsCode, 'Ana', `e2e-device-a-${config.runId}`);
    expect(joined.status).toBe(200);
    guest = { token: joined.data.token, playerId: joined.data.player.id };
    const account = await playerAccount(guest.token);
    expect(account.status).toBe(200);
    expect(account.data).toMatchObject({ linked: false });
  });

  test('saving progress creates the account and links the same player row', async () => {
    const linked = await playerLinkAccount(guest.token, { email, password, name: 'Ana', createAccount: true });
    expect(linked.status).toBe(200);
    expect(linked.data).toMatchObject({ linked: true, email, emailVerified: false });
    // The original token keeps working: nothing about the session changed.
    const account = await playerAccount(guest.token);
    expect(account.status).toBe(200);
    expect(account.data).toMatchObject({ linked: true, email });
  });

  test('linking twice with the same account is idempotent', async () => {
    const again = await playerLinkAccount(guest.token, { email, password, createAccount: false });
    expect(again.status).toBe(200);
    expect(again.data).toMatchObject({ linked: true, email });
  });

  test('a second device recovers the same participation with any code of the game', async () => {
    const recovered = await playerRecover({ email, password, deviceId: `e2e-device-b-${config.runId}`, joinCode: owlsCode });
    expect(recovered.status).toBe(200);
    expect(recovered.data.player.id).toBe(guest.playerId);
    expect(recovered.data.team.name).toBe('Falcons');
    expect(recovered.data.player.deviceId).toBe(`e2e-device-b-${config.runId}`);
    const fromB = await playerAccount(recovered.data.token);
    expect(fromB.data).toMatchObject({ linked: true, email });
  });

  test('another guest cannot claim the account into this game, and learns where it plays', async () => {
    const other = await playerJoin(owlsCode, 'Ana again', `e2e-device-c-${config.runId}`);
    expect(other.status).toBe(200);
    const conflict = await playerLinkAccount(other.data.token, { email, password, createAccount: false });
    expect(conflict.status).toBe(409);
    expect(conflict.data.code).toBe('ACCOUNT_ALREADY_IN_GAME');
    expect(conflict.data.errors).toMatchObject({ teamName: 'Falcons', sameTeam: 'false' });
  });

  test('wrong password and a game the account never joined answer with typed codes', async () => {
    const wrong = await playerRecover({ email, password: 'Wrong1234', deviceId: `e2e-device-d-${config.runId}`, joinCode: falconsCode });
    expect(wrong.status).toBe(400);
    expect(wrong.data.code).toBe('INVALID_CREDENTIALS');
    const elsewhere = await createGame(token, throwawayGameFixture(config.runId, 'account-elsewhere'));
    appendCreatedGameId(elsewhere.data.id);
    const bears = await createTeam(token, elsewhere.data.id, { name: 'Bears' });
    const none = await playerRecover({ email, password, deviceId: `e2e-device-d-${config.runId}`, joinCode: bears.data.joinCode });
    expect(none.status).toBe(400);
    expect(none.data.code).toBe('NO_PARTICIPATION_FOUND');
    await deleteGame(token, elsewhere.data.id);
  });
});
