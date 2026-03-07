import fs from 'fs';
import path from 'path';
import { config } from './config';
import * as api from './api-client';

const RUNTIME_DIR = path.resolve(__dirname, '..', '.runtime');

interface TokenStore {
  operatorAccessToken: string;
  operatorRefreshToken: string;
  operatorUser?: { id: string; email: string; name: string; role: string; createdAt: string };
  players: Record<string, string>; // playerId -> token
}

function tokensPath(runId?: string): string {
  const id = runId || fs.readFileSync(path.join(RUNTIME_DIR, 'latest-run-id'), 'utf-8').trim();
  return path.join(RUNTIME_DIR, `${id}.tokens`);
}

function readTokens(runId?: string): TokenStore {
  return JSON.parse(fs.readFileSync(tokensPath(runId), 'utf-8'));
}

function writeTokens(store: TokenStore, runId?: string): void {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(tokensPath(runId), JSON.stringify(store, null, 2));
}

export function getOperatorToken(runId?: string): string {
  return readTokens(runId).operatorAccessToken;
}

export function getOperatorRefreshToken(runId?: string): string {
  return readTokens(runId).operatorRefreshToken;
}

export function getOperatorUser(runId?: string): TokenStore['operatorUser'] {
  return readTokens(runId).operatorUser;
}

export function syncOperatorSession(
  session: {
    accessToken?: string | null;
    refreshToken?: string | null;
    user?: TokenStore['operatorUser'];
  },
  runId?: string,
): void {
  let store: TokenStore;

  try {
    store = readTokens(runId);
  } catch {
    store = {
      operatorAccessToken: '',
      operatorRefreshToken: '',
      operatorUser: undefined,
      players: {},
    };
  }

  if (session.accessToken) {
    store.operatorAccessToken = session.accessToken;
  }
  if (session.refreshToken) {
    store.operatorRefreshToken = session.refreshToken;
  }
  if (session.user) {
    store.operatorUser = session.user;
  }

  writeTokens(store, runId);
}

export function getPlayerToken(playerId?: string, runId?: string): string {
  const store = readTokens(runId);
  if (!playerId) {
    const ids = Object.keys(store.players);
    if (ids.length === 0) throw new Error('No player tokens stored');
    return store.players[ids[0]];
  }
  const token = store.players[playerId];
  if (!token) throw new Error(`No token for player ${playerId}`);
  return token;
}

export async function loginAndStoreTokens(runId?: string): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const { status, data } = await api.login(config.operatorEmail, config.operatorPassword);
  if (status !== 200) {
    throw new Error(`Login failed with status ${status}: ${JSON.stringify(data)}`);
  }

  let existingPlayers: Record<string, string> = {};
  try {
    existingPlayers = readTokens(runId).players;
  } catch {
    existingPlayers = {};
  }

  const store: TokenStore = {
    operatorAccessToken: data.accessToken,
    operatorRefreshToken: data.refreshToken,
    operatorUser: data.user,
    players: existingPlayers,
  };
  writeTokens(store, runId);

  return { accessToken: data.accessToken, refreshToken: data.refreshToken };
}

export async function joinPlayerAndStoreToken(
  joinCode: string,
  displayName: string,
  runId?: string,
): Promise<{ playerId: string; teamId: string; token: string }> {
  const deviceId = `e2e-${Date.now()}`;
  const { status, data } = await api.playerJoin(joinCode, displayName, deviceId);
  if (status !== 200) {
    throw new Error(`Player join failed with status ${status}: ${JSON.stringify(data)}`);
  }

  const store = readTokens(runId);
  store.players[data.player.id] = data.token;
  writeTokens(store, runId);

  return { playerId: data.player.id, teamId: data.team.id, token: data.token };
}

export async function refreshAndStoreTokens(runId?: string): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const store = readTokens(runId);
  const { status, data } = await api.refreshToken(store.operatorRefreshToken);
  if (status !== 200) {
    // Refresh failed — fall back to full login
    return loginAndStoreTokens(runId);
  }
  store.operatorAccessToken = data.accessToken;
  store.operatorRefreshToken = data.refreshToken;
  if (data.user) store.operatorUser = data.user;
  writeTokens(store, runId);
  return { accessToken: data.accessToken, refreshToken: data.refreshToken };
}

export function deleteTokens(runId?: string): void {
  const p = tokensPath(runId);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
