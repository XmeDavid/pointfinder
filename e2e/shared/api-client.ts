import * as fs from 'fs';
import { config } from './config';

const BASE = config.baseUrl;

async function request(
  method: string,
  path: string,
  opts: { body?: unknown; token?: string; formData?: FormData } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

  let bodyInit: BodyInit | undefined;
  if (opts.formData) {
    bodyInit = opts.formData;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyInit = JSON.stringify(opts.body);
  }

  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(`${BASE}${path}`, { method, headers, body: bodyInit });
    if (res.status !== 503 || attempt === maxRetries - 1) return res;
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  return fetch(`${BASE}${path}`, { method, headers, body: bodyInit });
}

async function json<T = any>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text } as T;
  }
}

// --- Auth ---

export async function login(email: string, password: string) {
  const res = await request('POST', '/api/auth/login', { body: { email, password } });
  return { status: res.status, data: await json(res) };
}

export async function refreshToken(refreshTokenStr: string) {
  const res = await request('POST', '/api/auth/refresh', {
    body: { refreshToken: refreshTokenStr },
  });
  return { status: res.status, data: await json(res) };
}

export async function playerJoin(joinCode: string, displayName: string, deviceId: string) {
  const res = await request('POST', '/api/auth/player/join', {
    body: { joinCode, displayName, deviceId },
  });
  return { status: res.status, data: await json(res) };
}

// --- Games ---

export async function createGame(token: string, body: { name: string; description?: string }) {
  const res = await request('POST', '/api/games', { body, token });
  return { status: res.status, data: await json(res) };
}

export async function getGame(token: string, gameId: string) {
  const res = await request('GET', `/api/games/${gameId}`, { token });
  return { status: res.status, data: await json(res) };
}

export async function getGames(token: string) {
  const res = await request('GET', '/api/games', { token });
  return { status: res.status, data: await json(res) };
}

export async function updateGame(
  token: string,
  gameId: string,
  body: { name?: string; description?: string; broadcastEnabled?: boolean },
) {
  const res = await request('PUT', `/api/games/${gameId}`, { body, token });
  return { status: res.status, data: await json(res) };
}

export async function updateGameStatus(
  token: string,
  gameId: string,
  status: string,
  resetProgress?: boolean,
) {
  const res = await request('PATCH', `/api/games/${gameId}/status`, {
    body: { status, resetProgress },
    token,
  });
  return { status: res.status, data: await json(res) };
}

export async function deleteGame(token: string, gameId: string) {
  const res = await request('DELETE', `/api/games/${gameId}`, { token });
  return { status: res.status, data: await json(res) };
}

export async function exportGame(token: string, gameId: string) {
  const res = await request('GET', `/api/games/${gameId}/export`, { token });
  return { status: res.status, data: await json(res) };
}

export async function importGame(token: string, gameData: unknown) {
  const res = await request('POST', '/api/games/import', { body: { gameData }, token });
  return { status: res.status, data: await json(res) };
}

// --- Bases ---

export async function createBase(
  token: string,
  gameId: string,
  body: { name: string; description?: string; lat: number; lng: number; fixedChallengeId?: string },
) {
  const res = await request('POST', `/api/games/${gameId}/bases`, { body, token });
  return { status: res.status, data: await json(res) };
}

export async function getBases(token: string, gameId: string) {
  const res = await request('GET', `/api/games/${gameId}/bases`, { token });
  return { status: res.status, data: await json(res) };
}

export async function updateBase(
  token: string,
  gameId: string,
  baseId: string,
  body: { name?: string; description?: string; lat?: number; lng?: number; fixedChallengeId?: string },
) {
  const res = await request('PUT', `/api/games/${gameId}/bases/${baseId}`, { body, token });
  return { status: res.status, data: await json(res) };
}

export async function nfcLinkBase(token: string, gameId: string, baseId: string) {
  const res = await request('PATCH', `/api/games/${gameId}/bases/${baseId}/nfc-link`, { token });
  return { status: res.status, data: await json(res) };
}

export async function deleteBase(token: string, gameId: string, baseId: string) {
  const res = await request('DELETE', `/api/games/${gameId}/bases/${baseId}`, { token });
  return { status: res.status, data: await json(res) };
}

// --- Challenges ---

export async function createChallenge(
  token: string,
  gameId: string,
  body: {
    title: string;
    description?: string;
    answerType: string;
    points: number;
    correctAnswer?: string[];
    autoValidate?: boolean;
    requirePresenceToSubmit?: boolean;
  },
) {
  const res = await request('POST', `/api/games/${gameId}/challenges`, { body, token });
  return { status: res.status, data: await json(res) };
}

export async function getChallenges(token: string, gameId: string) {
  const res = await request('GET', `/api/games/${gameId}/challenges`, { token });
  return { status: res.status, data: await json(res) };
}

export async function updateChallenge(
  token: string,
  gameId: string,
  challengeId: string,
  body: { title?: string; description?: string; answerType?: string; points?: number },
) {
  const res = await request('PUT', `/api/games/${gameId}/challenges/${challengeId}`, {
    body,
    token,
  });
  return { status: res.status, data: await json(res) };
}

export async function deleteChallenge(token: string, gameId: string, challengeId: string) {
  const res = await request('DELETE', `/api/games/${gameId}/challenges/${challengeId}`, { token });
  return { status: res.status, data: await json(res) };
}

// --- Assignments ---

export async function createAssignment(
  token: string,
  gameId: string,
  body: { baseId: string; challengeId: string; teamId?: string },
) {
  const res = await request('POST', `/api/games/${gameId}/assignments`, { body, token });
  return { status: res.status, data: await json(res) };
}

export async function getAssignments(token: string, gameId: string) {
  const res = await request('GET', `/api/games/${gameId}/assignments`, { token });
  return { status: res.status, data: await json(res) };
}

export async function deleteAssignment(token: string, gameId: string, assignmentId: string) {
  const res = await request('DELETE', `/api/games/${gameId}/assignments/${assignmentId}`, {
    token,
  });
  return { status: res.status, data: await json(res) };
}

// --- Teams ---

export async function createTeam(token: string, gameId: string, body: { name: string }) {
  const res = await request('POST', `/api/games/${gameId}/teams`, { body, token });
  return { status: res.status, data: await json(res) };
}

export async function getTeams(token: string, gameId: string) {
  const res = await request('GET', `/api/games/${gameId}/teams`, { token });
  return { status: res.status, data: await json(res) };
}

export async function deleteTeam(token: string, gameId: string, teamId: string) {
  const res = await request('DELETE', `/api/games/${gameId}/teams/${teamId}`, { token });
  return { status: res.status, data: await json(res) };
}

// --- Submissions (Player) ---

export async function submitAnswer(
  playerToken: string,
  gameId: string,
  body: { baseId: string; challengeId: string; answer?: string; idempotencyKey?: string },
) {
  const res = await request('POST', `/api/player/games/${gameId}/submissions`, {
    body,
    token: playerToken,
  });
  return { status: res.status, data: await json(res) };
}

export async function submitAnswerWithFile(
  playerToken: string,
  gameId: string,
  body: { baseId: string; challengeId: string; filePath: string; answer?: string; idempotencyKey?: string },
) {
  const fileBytes = fs.readFileSync(body.filePath);
  const fileName = body.filePath.split('/').pop() ?? 'upload';
  const ext = fileName.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    heic: 'image/heic', mp4: 'video/mp4', mov: 'video/quicktime',
  };
  const formData = new FormData();
  formData.append('file', new Blob([fileBytes], { type: mimeTypes[ext ?? ''] ?? 'application/octet-stream' }), fileName);
  formData.append('baseId', body.baseId);
  formData.append('challengeId', body.challengeId);
  if (body.answer !== undefined) formData.append('answer', body.answer);
  if (body.idempotencyKey !== undefined) formData.append('idempotencyKey', body.idempotencyKey);
  const res = await request('POST', `/api/player/games/${gameId}/submissions/upload`, {
    formData,
    token: playerToken,
  });
  return { status: res.status, data: await json(res) };
}

export async function getProgress(playerToken: string, gameId: string) {
  const res = await request('GET', `/api/player/games/${gameId}/progress`, {
    token: playerToken,
  });
  return { status: res.status, data: await json(res) };
}

export async function playerCheckIn(playerToken: string, gameId: string, baseId: string) {
  const res = await request('POST', `/api/player/games/${gameId}/bases/${baseId}/check-in`, {
    token: playerToken,
  });
  return { status: res.status, data: await json(res) };
}

// --- Submissions (Operator) ---

export async function getSubmissions(token: string, gameId: string) {
  const res = await request('GET', `/api/games/${gameId}/submissions`, { token });
  return { status: res.status, data: await json(res) };
}

export async function reviewSubmission(
  token: string,
  gameId: string,
  submissionId: string,
  body: { status: 'approved' | 'rejected'; feedback?: string; points?: number },
) {
  const res = await request('PATCH', `/api/games/${gameId}/submissions/${submissionId}/review`, {
    body,
    token,
  });
  return { status: res.status, data: await json(res) };
}

// --- Monitoring ---

export async function getDashboard(token: string, gameId: string) {
  const res = await request('GET', `/api/games/${gameId}/monitoring/dashboard`, { token });
  return { status: res.status, data: await json(res) };
}

export async function getLeaderboard(token: string, gameId: string) {
  const res = await request('GET', `/api/games/${gameId}/monitoring/leaderboard`, { token });
  return { status: res.status, data: await json(res) };
}

export async function getActivity(token: string, gameId: string) {
  const res = await request('GET', `/api/games/${gameId}/monitoring/activity`, { token });
  return { status: res.status, data: await json(res) };
}

export async function getMonitoringProgress(token: string, gameId: string) {
  const res = await request('GET', `/api/games/${gameId}/monitoring/progress`, { token });
  return { status: res.status, data: await json(res) };
}

// --- Notifications ---

export async function sendNotification(
  token: string,
  gameId: string,
  body: { message: string; targetTeamId?: string },
) {
  const res = await request('POST', `/api/games/${gameId}/notifications`, { body, token });
  return { status: res.status, data: await json(res) };
}

export async function getNotifications(token: string, gameId: string) {
  const res = await request('GET', `/api/games/${gameId}/notifications`, { token });
  return { status: res.status, data: await json(res) };
}

// --- Broadcast (Public) ---

export async function getBroadcast(code: string) {
  const res = await request('GET', `/api/broadcast/${code}`);
  return { status: res.status, data: await json(res) };
}

export async function getBroadcastLeaderboard(code: string) {
  const res = await request('GET', `/api/broadcast/${code}/leaderboard`);
  return { status: res.status, data: await json(res) };
}

// --- User ---

export async function getMe(token: string) {
  const res = await request('GET', '/api/users/me', { token });
  return { status: res.status, data: await json(res) };
}

// --- Player Notifications ---

export async function getPlayerNotifications(playerToken: string) {
  const res = await request('GET', '/api/player/notifications', { token: playerToken });
  return { status: res.status, data: await json(res) };
}
