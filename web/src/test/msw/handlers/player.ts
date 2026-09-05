import { http, HttpResponse } from 'msw'

/** Player-facing endpoints. Registered before the operator handlers so the shared snapshot path resolves to the player shape here. */
export const playerFixtures = {
  gameId: 'g1',
  playerId: 'p1',
  teamId: 'team1',
  bases: [
    { id: 'b1', gameId: 'g1', lat: 40.09, lng: -8.87, nfcLinked: true, checkInMethod: 'NFC', checkInRadiusM: 15, hidden: false, fixedChallengeId: null },
    { id: 'b2', gameId: 'g1', lat: 40.091, lng: -8.871, nfcLinked: true, checkInMethod: 'NFC', checkInRadiusM: 15, hidden: false, fixedChallengeId: null },
    { id: 'b3', gameId: 'g1', lat: 40.092, lng: -8.872, nfcLinked: false, checkInMethod: 'NFC', checkInRadiusM: 15, hidden: false, fixedChallengeId: null },
  ],
  challenges: [
    { id: 'c1', gameId: 'g1', title: 'The old mill', description: 'Count the wheels', content: '<p>How many wheels?</p>', answerType: 'text', points: 10, completionContent: '<p>Well done, the mill dates from 1850.</p>' },
    { id: 'c2', gameId: 'g1', title: 'Granite boulder', description: 'Team photo', content: '', answerType: 'file', points: 20 },
    { id: 'c3', gameId: 'g1', title: 'Chapel', description: 'Just be there', content: '', answerType: 'none', points: 5 },
  ],
  assignments: [
    { id: 'a1', gameId: 'g1', baseId: 'b1', challengeId: 'c1', teamId: null },
    { id: 'a2', gameId: 'g1', baseId: 'b2', challengeId: 'c2', teamId: null },
    { id: 'a3', gameId: 'g1', baseId: 'b3', challengeId: 'c3', teamId: null },
  ],
  progress: [
    { baseId: 'b1', challengeTitle: 'The old mill', lat: 40.09, lng: -8.87, nfcLinked: true, checkInMethod: 'NFC', checkInRadiusM: 15, status: 'completed', checkedInAt: '2026-09-05T09:00:00Z', challengeId: 'c1', submissionStatus: 'correct' },
    { baseId: 'b2', challengeTitle: 'Granite boulder', lat: 40.091, lng: -8.871, nfcLinked: true, checkInMethod: 'NFC', checkInRadiusM: 15, status: 'checked_in', checkedInAt: '2026-09-05T09:30:00Z', challengeId: 'c2', submissionStatus: null },
    { baseId: 'b3', challengeTitle: 'Chapel', lat: 40.092, lng: -8.872, nfcLinked: false, checkInMethod: 'NFC', checkInRadiusM: 15, status: 'submitted', checkedInAt: '2026-09-05T09:40:00Z', challengeId: 'c3', submissionStatus: 'pending' },
  ],
  notifications: [
    { id: 'n1', gameId: 'g1', message: 'Lunch is at the chapel at 12:30.', targetTeamId: null, sentAt: '2026-09-05T10:00:00Z', sentBy: 'op1' },
    { id: 'n2', gameId: 'g1', message: 'Falcons, your photo at the boulder was great!', targetTeamId: 'team1', sentAt: '2026-09-05T10:20:00Z', sentBy: 'op1' },
  ],
}

export const playerHandlers = [
  http.get('/api/player/games/:gameId/data', () =>
    HttpResponse.json({ gameStatus: 'live', unlockTrigger: 'CHECK_IN', bases: playerFixtures.bases, challenges: playerFixtures.challenges, assignments: playerFixtures.assignments, progress: playerFixtures.progress }),
  ),
  http.get('/api/games/:gameId/snapshot', ({ request }) => {
    // Operator sessions use the same path; only answer for the player fixture game.
    const url = new URL(request.url)
    if (!url.pathname.includes(`/games/${playerFixtures.gameId}/`)) return undefined
    return HttpResponse.json({
      stateVersion: 3,
      serverTime: '2026-09-05T10:30:00Z',
      game: { id: 'g1', name: 'Serra da Estrela', status: 'live', tileSource: 'osm' },
      team: { id: 'team1', name: 'Falcons', color: '#22c55e', memberCount: 4 },
      progress: playerFixtures.progress,
      submissions: [],
      uploadSessions: [],
    })
  }),
  http.get('/api/player/notifications', () => HttpResponse.json(playerFixtures.notifications)),
  http.get('/api/player/notifications/unseen-count', () => HttpResponse.json({ count: 2 })),
  http.post('/api/player/notifications/mark-seen', () => new HttpResponse(null, { status: 204 })),
  http.post('/api/player/games/:gameId/location', () => new HttpResponse(null, { status: 204 })),
  http.delete('/api/player/me', () => new HttpResponse(null, { status: 204 })),

  http.post('/api/player/games/:gameId/bases/:baseId/check-in', async ({ params, request }) => {
    const body = (await request.json()) as { method?: string; token?: string; nfcToken?: string }
    const token = body.token ?? body.nfcToken
    if (body.method !== 'geo' && !token) return HttpResponse.json({ status: 400, message: 'NFC token required', code: 'NFC_TOKEN_REQUIRED' }, { status: 400 })
    if (token === 'wrong') return HttpResponse.json({ status: 400, message: 'Invalid check-in token', code: 'CHECK_IN_TOKEN_INVALID' }, { status: 400 })
    const method = body.method === 'geo' ? 'LOCATION' : body.method === 'qr' ? 'QR' : 'NFC'
    return HttpResponse.json({ checkInId: 'ci-1', baseId: params.baseId, checkedInAt: '2026-09-05T10:45:00Z', method, verification: 'VERIFIED' })
  }),
  http.post('/api/player/games/:gameId/submissions', async ({ request }) => {
    const body = (await request.json()) as { baseId: string; challengeId: string; answer: string; fileUrls?: string[]; idempotencyKey?: string }
    const correct = body.answer.trim() === '7'
    const base = { id: `sub-${body.idempotencyKey ?? 'x'}`, teamId: 'team1', challengeId: body.challengeId, baseId: body.baseId, answer: body.answer, submittedAt: '2026-09-05T10:50:00Z', fileUrls: body.fileUrls ?? null }
    if (body.fileUrls?.length) return HttpResponse.json({ ...base, status: 'pending' })
    if (body.challengeId === 'c3') return HttpResponse.json({ ...base, status: 'approved', completionContent: '<p>The chapel bell is from 1720.</p>' })
    return HttpResponse.json(correct
      ? { ...base, status: 'correct', points: 10, completionContent: '<p>Well done, the mill dates from 1850.</p>' }
      : { ...base, status: 'rejected', feedback: 'Count only the wheels inside the circle.' })
  }),
  http.post('/api/player/games/:gameId/uploads/sessions', async ({ params, request }) => {
    const body = (await request.json()) as { contentType: string; totalSizeBytes: number; originalFileName?: string; mediaItemKey?: string }
    const chunk = 1024 * 1024
    return HttpResponse.json({ sessionId: 'up-1', gameId: params.gameId, mediaItemKey: body.mediaItemKey ?? null, originalFileName: body.originalFileName ?? null, contentType: body.contentType, totalSizeBytes: body.totalSizeBytes, chunkSizeBytes: chunk, totalChunks: Math.max(1, Math.ceil(body.totalSizeBytes / chunk)), uploadedChunks: [], status: 'active', fileUrl: null, expiresAt: '2026-09-06T00:00:00Z' })
  }),
  http.get('/api/player/games/:gameId/uploads/sessions/:sessionId', ({ params }) =>
    HttpResponse.json({ sessionId: params.sessionId, gameId: params.gameId, contentType: 'image/jpeg', totalSizeBytes: 3, chunkSizeBytes: 1024 * 1024, totalChunks: 1, uploadedChunks: [], status: 'active', fileUrl: null, expiresAt: '2026-09-06T00:00:00Z' })),
  http.put('/api/player/games/:gameId/uploads/sessions/:sessionId/chunks/:index', ({ params }) =>
    HttpResponse.json({ sessionId: params.sessionId, gameId: params.gameId, contentType: 'image/jpeg', totalSizeBytes: 3, chunkSizeBytes: 1024 * 1024, totalChunks: 1, uploadedChunks: [Number(params.index)], status: 'active', fileUrl: null, expiresAt: '2026-09-06T00:00:00Z' })),
  http.post('/api/player/games/:gameId/uploads/sessions/:sessionId/complete', ({ params }) =>
    HttpResponse.json({ sessionId: params.sessionId, gameId: params.gameId, contentType: 'image/jpeg', totalSizeBytes: 3, chunkSizeBytes: 1024 * 1024, totalChunks: 1, uploadedChunks: [0], status: 'completed', fileUrl: 'https://cdn.test/photo.jpg', expiresAt: '2026-09-06T00:00:00Z' })),
  http.post('/api/auth/player/join', async ({ request }) => {
    const body = (await request.json()) as { joinCode: string; displayName: string; deviceId: string }
    if (body.joinCode === 'BADCODE') return HttpResponse.json({ status: 404, message: 'Unknown code', code: 'INVALID_JOIN_CODE' }, { status: 404 })
    return HttpResponse.json({ token: 'player-token', player: { id: 'p1', displayName: body.displayName, deviceId: body.deviceId }, team: { id: 'team1', name: 'Falcons', color: '#22c55e' }, game: { id: 'g1', name: 'Serra da Estrela', description: '', status: 'live', tileSource: 'osm' } })
  }),
]
