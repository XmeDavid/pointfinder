import type { HttpClient } from './http'
import type {
  ActivityEvent,
  Assignment,
  Base,
  BaseProgress,
  BaseUnlockOverrideResponse,
  Challenge,
  CheckInResponse,
  CreateAssignmentRequest,
  CreateGameRequest,
  CreateTagRequest,
  CreateTeamRequest,
  EntityId,
  Game,
  GameDataResponse,
  GameTag,
  InviteRequest,
  InviteResponse,
  LeaderboardEntry,
  LocationUpdateRequest,
  MarkCompletedRequest,
  NotificationResponse,
  OperatorAuthResponse,
  OperatorLoginRequest,
  OperatorNotificationSettings,
  OperatorSnapshotResponse,
  PlayerAuthResponse,
  PlayerJoinRequest,
  PlayerNotificationResponse,
  PlayerResponse,
  PlayerSnapshotResponse,
  PlayerSubmissionRequest,
  PushTokenRequest,
  ReviewSubmissionRequest,
  SendNotificationRequest,
  SubmissionResponse,
  Team,
  TeamBaseProgressResponse,
  TeamLocationResponse,
  TeamVariable,
  TeamVariablesCompletenessResponse,
  TeamVariablesResponse,
  UnlockOverrideRequest,
  UnseenCountResponse,
  UpdateGameRequest,
  UpdateGameStatusRequest,
  UpdateOperatorNotificationSettingsRequest,
  UpdateTagRequest,
  UpdateTeamRequest,
  UploadSessionInitRequest,
  UploadSessionResponse,
  UpsertBaseRequest,
  UpsertChallengeRequest,
  UserResponse,
  Workspace,
} from './types'

/**
 * Every endpoint the mobile app and the admin share, grouped by audience.
 * Paths are the backend's; nothing here reshapes data.
 */
export function createApi(http: HttpClient) {
  const g = (gameId: EntityId) => `/api/games/${encodeURIComponent(gameId)}`
  const p = (gameId: EntityId) => `/api/player/games/${encodeURIComponent(gameId)}`

  const auth = {
    /** Join a team with its code. The device id keeps a player attached to their team across reinstalls. */
    playerJoin: (body: PlayerJoinRequest) => http.post<PlayerAuthResponse>('/api/auth/player/join', body, { anonymous: true }),
    operatorLogin: (body: OperatorLoginRequest) => http.post<OperatorAuthResponse>('/api/auth/login', body, { anonymous: true }),
    refresh: (refreshToken: string) => http.post<OperatorAuthResponse>('/api/auth/refresh', { refreshToken }, { anonymous: true }),
    logout: (refreshToken: string) => http.post<void>('/api/auth/logout', { refreshToken }, { anonymous: true }),
    me: () => http.get<UserResponse>('/api/users/me'),
  }

  const player = {
    /** Everything needed to play offline: bases, challenges, assignments, and progress. */
    gameData: (gameId: EntityId) => http.get<GameDataResponse>(`${p(gameId)}/data`),
    progress: (gameId: EntityId) => http.get<BaseProgress[]>(`${p(gameId)}/progress`),
    bases: (gameId: EntityId) => http.get<Base[]>(`${p(gameId)}/bases`),
    /** Canonical state for the player's team. Compare `stateVersion` with the realtime client's. */
    snapshot: (gameId: EntityId) => http.get<PlayerSnapshotResponse>(`${g(gameId)}/snapshot`),
    checkIn: (gameId: EntityId, baseId: EntityId, nfcToken: string) =>
      http.post<CheckInResponse>(`${p(gameId)}/bases/${encodeURIComponent(baseId)}/check-in`, { nfcToken }),
    submit: (gameId: EntityId, body: PlayerSubmissionRequest) => http.post<SubmissionResponse>(`${p(gameId)}/submissions`, body),
    updateLocation: (gameId: EntityId, body: LocationUpdateRequest) => http.post<void>(`${p(gameId)}/location`, body),
    registerPushToken: (body: PushTokenRequest) => http.put<void>('/api/player/push-token', body),
    notifications: () => http.get<PlayerNotificationResponse[]>('/api/player/notifications'),
    unseenNotificationCount: () => http.get<UnseenCountResponse>('/api/player/notifications/unseen-count'),
    markNotificationsSeen: () => http.post<void>('/api/player/notifications/mark-seen'),
    /** GDPR self-service: removes the player record. Team data stays. */
    deleteMe: () => http.delete('/api/player/me'),
    uploads: {
      list: (gameId: EntityId) => http.get<UploadSessionResponse[]>(`${p(gameId)}/uploads/sessions`),
      start: (gameId: EntityId, body: UploadSessionInitRequest) =>
        http.post<UploadSessionResponse>(`${p(gameId)}/uploads/sessions`, body),
      get: (gameId: EntityId, sessionId: EntityId) =>
        http.get<UploadSessionResponse>(`${p(gameId)}/uploads/sessions/${encodeURIComponent(sessionId)}`),
      /** Upload one chunk. Safe to repeat: the backend records which indexes it has. */
      putChunk: (gameId: EntityId, sessionId: EntityId, index: number, data: Blob | ArrayBuffer | Uint8Array, contentType = 'application/octet-stream') =>
        http.put<UploadSessionResponse>(
          `${p(gameId)}/uploads/sessions/${encodeURIComponent(sessionId)}/chunks/${index}`,
          undefined,
          { raw: { data: data as BodyInit, contentType }, timeoutMs: 120_000 },
        ),
      complete: (gameId: EntityId, sessionId: EntityId) =>
        http.post<UploadSessionResponse>(`${p(gameId)}/uploads/sessions/${encodeURIComponent(sessionId)}/complete`),
      cancel: (gameId: EntityId, sessionId: EntityId) =>
        http.delete(`${p(gameId)}/uploads/sessions/${encodeURIComponent(sessionId)}`),
      cancelAll: (gameId: EntityId) => http.delete(`${p(gameId)}/uploads/sessions`),
    },
  }

  const games = {
    list: () => http.get<Game[]>('/api/games'),
    get: (gameId: EntityId) => http.get<Game>(g(gameId)),
    create: (body: CreateGameRequest) => http.post<Game>('/api/games', body),
    update: (gameId: EntityId, body: UpdateGameRequest) => http.put<Game>(g(gameId), body),
    remove: (gameId: EntityId) => http.delete(g(gameId)),
    setStatus: (gameId: EntityId, body: UpdateGameStatusRequest) => http.patch<Game>(`${g(gameId)}/status`, body),
    /** Canonical operator state including scores. */
    snapshot: (gameId: EntityId) => http.get<OperatorSnapshotResponse>(`${g(gameId)}/snapshot`),
    operators: (gameId: EntityId) => http.get<UserResponse[]>(`${g(gameId)}/operators`),
    addOperator: (gameId: EntityId, userId: EntityId) => http.post<void>(`${g(gameId)}/operators/${encodeURIComponent(userId)}`),
    removeOperator: (gameId: EntityId, userId: EntityId) => http.delete(`${g(gameId)}/operators/${encodeURIComponent(userId)}`),
    export: (gameId: EntityId) => http.get<unknown>(`${g(gameId)}/export`),
    import: (body: unknown) => http.post<Game>('/api/games/import', body),
    workspaces: () => http.get<Workspace[]>('/api/workspaces'),
  }

  const bases = {
    list: (gameId: EntityId) => http.get<Base[]>(`${g(gameId)}/bases`),
    create: (gameId: EntityId, body: UpsertBaseRequest) => http.post<Base>(`${g(gameId)}/bases`, body),
    update: (gameId: EntityId, baseId: EntityId, body: UpsertBaseRequest) =>
      http.put<Base>(`${g(gameId)}/bases/${encodeURIComponent(baseId)}`, body),
    remove: (gameId: EntityId, baseId: EntityId) => http.delete(`${g(gameId)}/bases/${encodeURIComponent(baseId)}`),
    /** Mark a base as having a written tag. Call after a verified NFC write. */
    markNfcLinked: (gameId: EntityId, baseId: EntityId) => http.patch<Base>(`${g(gameId)}/bases/${encodeURIComponent(baseId)}/nfc-link`),
    reorder: (gameId: EntityId, orderedIds: EntityId[]) => http.patch<void>(`${g(gameId)}/bases/reorder`, { orderedIds }),
  }

  const challenges = {
    list: (gameId: EntityId) => http.get<Challenge[]>(`${g(gameId)}/challenges`),
    create: (gameId: EntityId, body: UpsertChallengeRequest) => http.post<Challenge>(`${g(gameId)}/challenges`, body),
    update: (gameId: EntityId, challengeId: EntityId, body: UpsertChallengeRequest) =>
      http.put<Challenge>(`${g(gameId)}/challenges/${encodeURIComponent(challengeId)}`, body),
    remove: (gameId: EntityId, challengeId: EntityId) => http.delete(`${g(gameId)}/challenges/${encodeURIComponent(challengeId)}`),
    reorder: (gameId: EntityId, orderedIds: EntityId[]) => http.patch<void>(`${g(gameId)}/challenges/reorder`, { orderedIds }),
  }

  const assignments = {
    list: (gameId: EntityId) => http.get<Assignment[]>(`${g(gameId)}/assignments`),
    create: (gameId: EntityId, body: CreateAssignmentRequest) => http.post<Assignment>(`${g(gameId)}/assignments`, body),
    remove: (gameId: EntityId, assignmentId: EntityId) =>
      http.delete(`${g(gameId)}/assignments/${encodeURIComponent(assignmentId)}`),
  }

  const teams = {
    list: (gameId: EntityId) => http.get<Team[]>(`${g(gameId)}/teams`),
    create: (gameId: EntityId, body: CreateTeamRequest) => http.post<Team>(`${g(gameId)}/teams`, body),
    update: (gameId: EntityId, teamId: EntityId, body: UpdateTeamRequest) =>
      http.put<Team>(`${g(gameId)}/teams/${encodeURIComponent(teamId)}`, body),
    remove: (gameId: EntityId, teamId: EntityId) => http.delete(`${g(gameId)}/teams/${encodeURIComponent(teamId)}`),
    players: (gameId: EntityId, teamId: EntityId) =>
      http.get<PlayerResponse[]>(`${g(gameId)}/teams/${encodeURIComponent(teamId)}/players`),
    removePlayer: (gameId: EntityId, teamId: EntityId, playerId: EntityId) =>
      http.delete(`${g(gameId)}/teams/${encodeURIComponent(teamId)}/players/${encodeURIComponent(playerId)}`),
    variables: (gameId: EntityId) => http.get<TeamVariablesResponse>(`${g(gameId)}/team-variables`),
    setVariables: (gameId: EntityId, variables: TeamVariable[]) =>
      http.put<TeamVariablesResponse>(`${g(gameId)}/team-variables`, { variables }),
    variablesCompleteness: (gameId: EntityId) =>
      http.get<TeamVariablesCompletenessResponse>(`${g(gameId)}/team-variables/completeness`),
  }

  const tags = {
    list: (gameId: EntityId) => http.get<GameTag[]>(`${g(gameId)}/tags`),
    create: (gameId: EntityId, body: CreateTagRequest) => http.post<GameTag>(`${g(gameId)}/tags`, body),
    update: (gameId: EntityId, tagId: EntityId, body: UpdateTagRequest) =>
      http.patch<GameTag>(`${g(gameId)}/tags/${encodeURIComponent(tagId)}`, body),
    remove: (gameId: EntityId, tagId: EntityId) => http.delete(`${g(gameId)}/tags/${encodeURIComponent(tagId)}`),
  }

  const monitoring = {
    locations: (gameId: EntityId) => http.get<TeamLocationResponse[]>(`${g(gameId)}/monitoring/locations`),
    progress: (gameId: EntityId) => http.get<TeamBaseProgressResponse[]>(`${g(gameId)}/monitoring/progress`),
    leaderboard: (gameId: EntityId) => http.get<LeaderboardEntry[]>(`${g(gameId)}/monitoring/leaderboard`),
    activity: (gameId: EntityId) => http.get<ActivityEvent[]>(`${g(gameId)}/monitoring/activity`),
  }

  const submissions = {
    list: (gameId: EntityId) => http.get<SubmissionResponse[]>(`${g(gameId)}/submissions`),
    review: (gameId: EntityId, submissionId: EntityId, body: ReviewSubmissionRequest) =>
      http.patch<SubmissionResponse>(`${g(gameId)}/submissions/${encodeURIComponent(submissionId)}/review`, body),
  }

  /** Operator interventions when the physical world misbehaves. Audited server-side. */
  const rescue = {
    manualCheckIn: (gameId: EntityId, teamId: EntityId, baseId: EntityId) =>
      http.post<CheckInResponse>(`${g(gameId)}/teams/${encodeURIComponent(teamId)}/check-in/${encodeURIComponent(baseId)}`),
    markCompleted: (gameId: EntityId, teamId: EntityId, baseId: EntityId, body: MarkCompletedRequest) =>
      http.post<SubmissionResponse>(
        `${g(gameId)}/teams/${encodeURIComponent(teamId)}/bases/${encodeURIComponent(baseId)}/mark-completed`,
        body,
      ),
    unlockOverride: (gameId: EntityId, teamId: EntityId, baseId: EntityId, body: UnlockOverrideRequest = {}) =>
      http.post<BaseUnlockOverrideResponse>(
        `${g(gameId)}/teams/${encodeURIComponent(teamId)}/bases/${encodeURIComponent(baseId)}/unlock-override`,
        body,
      ),
    unlockOverrides: (gameId: EntityId, teamId: EntityId) =>
      http.get<BaseUnlockOverrideResponse[]>(`${g(gameId)}/teams/${encodeURIComponent(teamId)}/unlock-overrides`),
  }

  const notifications = {
    list: (gameId: EntityId) => http.get<NotificationResponse[]>(`${g(gameId)}/notifications`),
    send: (gameId: EntityId, body: SendNotificationRequest) => http.post<NotificationResponse>(`${g(gameId)}/notifications`, body),
    mySettings: (gameId: EntityId) => http.get<OperatorNotificationSettings>(`${g(gameId)}/operator-notification-settings/me`),
    updateMySettings: (gameId: EntityId, body: UpdateOperatorNotificationSettingsRequest) =>
      http.put<OperatorNotificationSettings>(`${g(gameId)}/operator-notification-settings/me`, body),
    registerOperatorPushToken: (body: PushTokenRequest) => http.put<void>('/api/users/me/push-token', body),
  }

  const invites = {
    mine: () => http.get<InviteResponse[]>('/api/invites/my'),
    forGame: (gameId: EntityId) => http.get<InviteResponse[]>(`${g(gameId)}/invites`),
    create: (body: InviteRequest) => http.post<InviteResponse>('/api/invites', body),
    accept: (inviteId: EntityId) => http.post<void>(`/api/invites/${encodeURIComponent(inviteId)}/accept`),
    revoke: (inviteId: EntityId) => http.delete(`/api/invites/${encodeURIComponent(inviteId)}`),
  }

  return { auth, player, games, bases, challenges, assignments, teams, tags, monitoring, submissions, rescue, notifications, invites }
}

export type PointFinderApi = ReturnType<typeof createApi>
