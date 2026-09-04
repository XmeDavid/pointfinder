/**
 * PointFinder API data types, as the backend serialises them.
 *
 * Kept in one file on purpose: it is the contract, and a reader should be
 * able to scan it top to bottom. Player-facing types never carry scores;
 * that rule is enforced by the backend and mirrored here.
 */

export type EntityId = string
/** ISO 8601 timestamp string. */
export type IsoDateTime = string

export type GameStatus = 'setup' | 'live' | 'ended'
export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'correct'
export type BaseStatus = 'not_visited' | 'checked_in' | 'submitted' | 'completed' | 'rejected'
export type AnswerType = 'text' | 'file' | 'none'
export type UnlockTrigger = 'CHECK_IN' | 'SUBMISSION' | 'APPROVAL'
export type UserRole = 'admin' | 'operator'
export type PushPlatform = 'ios' | 'android'

// ---------------------------------------------------------------- auth

export interface PlayerJoinRequest {
  joinCode: string
  displayName: string
  deviceId: string
}

export interface PlayerAuthResponse {
  token: string
  player: { id: EntityId; displayName: string; deviceId: string }
  team: { id: EntityId; name: string; color: string }
  game: {
    id: EntityId
    name: string
    description: string
    status: GameStatus
    tileSource?: string | null
  }
}

export interface OperatorLoginRequest {
  email: string
  password: string
}

export interface UserResponse {
  id: EntityId
  name: string
  email: string
  role: UserRole
}

export interface OperatorAuthResponse {
  accessToken: string
  refreshToken: string
  user: UserResponse
}

export interface PushTokenRequest {
  pushToken: string
  platform?: PushPlatform
}

// ---------------------------------------------------------------- game setup

export interface Game {
  id: EntityId
  name: string
  description: string
  status: GameStatus
  tileSource?: string
  startDate?: IsoDateTime | null
  endDate?: IsoDateTime | null
  createdBy?: EntityId | null
  operatorIds?: EntityId[] | null
  uniformAssignment?: boolean
  broadcastEnabled?: boolean
  broadcastCode?: string | null
  unlockTrigger?: UnlockTrigger
  orgId?: EntityId | null
  orgName?: string | null
}

export interface GameTag {
  id: EntityId
  gameId: EntityId
  label: string
  /** 7-char hex, e.g. "#3b82f6". */
  color: string
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface Base {
  id: EntityId
  gameId?: EntityId | null
  name: string
  description: string
  lat: number
  lng: number
  nfcLinked: boolean
  hidden?: boolean
  fixedChallengeId?: EntityId | null
  /** Operator-only. Written into the tag URL and verified at check-in. */
  nfcToken?: string | null
  /** Operator-only. */
  tagIds?: EntityId[] | null
}

export interface Challenge {
  id: EntityId
  gameId?: EntityId | null
  title: string
  description: string
  content: string
  completionContent?: string | null
  answerType: AnswerType
  points: number
  unlocksBaseIds?: EntityId[] | null
  autoValidate?: boolean
  correctAnswer?: string[] | null
  locationBound?: boolean
  fixedBaseId?: EntityId | null
  requirePresenceToSubmit?: boolean
  operatorNotes?: string | null
  tagIds?: EntityId[] | null
}

export interface Assignment {
  id: EntityId
  gameId?: EntityId | null
  baseId: EntityId
  challengeId: EntityId
  /** Null means all teams. */
  teamId?: EntityId | null
}

export interface Team {
  id: EntityId
  gameId?: EntityId | null
  name: string
  joinCode?: string | null
  color: string
}

export interface PlayerResponse {
  id: EntityId
  teamId: EntityId
  deviceId: string
  displayName: string
}

// ---------------------------------------------------------------- player gameplay

/** Per-base progress row for the player's team. Players see challenge titles, not base names. */
export interface BaseProgress {
  baseId: EntityId
  challengeTitle?: string | null
  lat: number
  lng: number
  nfcLinked: boolean
  status: BaseStatus
  checkedInAt?: IsoDateTime | null
  challengeId?: EntityId | null
  submissionStatus?: string | null
}

export interface CheckInRequest {
  nfcToken: string
}

export interface CheckInChallengeInfo {
  id: EntityId
  title: string
  description: string
  content: string
  completionContent?: string | null
  answerType: AnswerType
  points: number
  requirePresenceToSubmit?: boolean
}

export interface CheckInResponse {
  checkInId: EntityId
  baseId: EntityId
  checkedInAt: IsoDateTime
  challenge?: CheckInChallengeInfo | null
}

export interface PlayerSubmissionRequest {
  baseId: EntityId
  challengeId: EntityId
  answer: string
  fileUrl?: string | null
  fileUrls?: string[] | null
  /** UUID chosen by the client so a retried request is not a duplicate. */
  idempotencyKey?: string | null
}

export interface SubmissionResponse {
  id: EntityId
  teamId: EntityId
  challengeId: EntityId
  baseId: EntityId
  answer: string
  fileUrl?: string | null
  fileUrls?: string[] | null
  status: SubmissionStatus
  submittedAt: IsoDateTime
  reviewedBy?: EntityId | null
  feedback?: string | null
  points?: number | null
  completionContent?: string | null
}

export interface LocationUpdateRequest {
  lat: number
  lng: number
  /** Horizontal accuracy in metres. Not stored by the backend yet. */
  accuracy?: number
  /** When the fix was taken on the device. Not stored by the backend yet. */
  capturedAt?: IsoDateTime
}

export interface GameDataResponse {
  gameStatus?: GameStatus | null
  unlockTrigger?: UnlockTrigger | null
  bases: Base[]
  challenges: Challenge[]
  assignments: Assignment[]
  progress: BaseProgress[]
}

export interface PlayerNotificationResponse {
  id: EntityId
  gameId: EntityId
  message: string
  targetTeamId?: EntityId | null
  sentAt: IsoDateTime
  sentBy: EntityId
}

export interface UnseenCountResponse {
  count: number
}

// ---------------------------------------------------------------- media uploads

export interface UploadSessionInitRequest {
  originalFileName?: string | null
  contentType: string
  totalSizeBytes: number
  chunkSizeBytes?: number | null
}

export interface UploadSessionResponse {
  sessionId: EntityId
  gameId: EntityId
  contentType: string
  totalSizeBytes: number
  chunkSizeBytes: number
  totalChunks: number
  uploadedChunks: number[]
  status: string
  fileUrl?: string | null
  expiresAt: IsoDateTime
}

// ---------------------------------------------------------------- snapshots

export interface PlayerSnapshotGameInfo {
  id: EntityId
  name: string
  description?: string | null
  status: GameStatus
  unlockTrigger?: UnlockTrigger | null
  tileSource?: string | null
  startDate?: IsoDateTime | null
  endDate?: IsoDateTime | null
}

export interface PlayerSnapshotTeamInfo {
  id: EntityId
  name: string
  color?: string | null
  memberCount: number
}

export interface PlayerSnapshotSubmissionSummary {
  id: EntityId
  baseId?: EntityId | null
  challengeId?: EntityId | null
  status?: string | null
  submittedAt?: IsoDateTime | null
  fileUrl?: string | null
  fileUrls?: string[] | null
}

/** Canonical player state. Structurally score-free. */
export interface PlayerSnapshotResponse {
  stateVersion: number
  serverTime: IsoDateTime
  game: PlayerSnapshotGameInfo
  team: PlayerSnapshotTeamInfo
  progress: BaseProgress[]
  submissions: PlayerSnapshotSubmissionSummary[]
  uploadSessions: UploadSessionResponse[]
}

export interface OperatorSnapshotGameInfo extends PlayerSnapshotGameInfo {
  uniformAssignment?: boolean | null
  broadcastEnabled?: boolean | null
  broadcastCode?: string | null
}

export interface OperatorSnapshotTeamInfo {
  id: EntityId
  name: string
  color?: string | null
  score: number
  memberCount: number
}

export interface LeaderboardEntry {
  teamId: EntityId
  teamName: string
  color: string
  points: number
  completedChallenges: number
}

export interface OperatorSnapshotResponse {
  stateVersion: number
  serverTime: IsoDateTime
  game: OperatorSnapshotGameInfo
  teams: OperatorSnapshotTeamInfo[]
  leaderboard: LeaderboardEntry[]
  pendingReviews: number
  activeUploads: number
  needsAttention: number
}

// ---------------------------------------------------------------- operator monitoring

export interface TeamLocationResponse {
  teamId: EntityId
  playerId?: EntityId | null
  displayName?: string | null
  lat: number
  lng: number
  updatedAt: IsoDateTime
}

export interface TeamBaseProgressResponse {
  baseId: EntityId
  teamId: EntityId
  status: BaseStatus
  checkedInAt?: IsoDateTime | null
  challengeId?: EntityId | null
  submissionStatus?: string | null
}

export interface ActivityEvent {
  id: EntityId
  gameId: EntityId
  type: string
  teamId?: EntityId | null
  baseId?: EntityId | null
  challengeId?: EntityId | null
  message: string
  timestamp: IsoDateTime
}

export interface ReviewSubmissionRequest {
  status: Extract<SubmissionStatus, 'approved' | 'rejected'>
  feedback?: string | null
  points?: number | null
}

export interface NotificationResponse {
  id: EntityId
  gameId: EntityId
  message: string
  targetTeamId?: EntityId | null
  sentAt: IsoDateTime
  sentBy: EntityId
}

export interface SendNotificationRequest {
  message: string
  targetTeamId?: EntityId | null
}

export interface OperatorNotificationSettings {
  gameId: EntityId
  userId: EntityId
  notifyPendingSubmissions: boolean
  notifyAllSubmissions: boolean
  notifyCheckIns: boolean
}

export type UpdateOperatorNotificationSettingsRequest = Omit<OperatorNotificationSettings, 'gameId' | 'userId'>

// ---------------------------------------------------------------- operator setup requests

export interface CreateGameRequest {
  name: string
  description?: string
  startDate?: IsoDateTime | null
  endDate?: IsoDateTime | null
  uniformAssignment?: boolean
  tileSource?: string | null
}

export interface UpdateGameRequest extends CreateGameRequest {
  broadcastEnabled?: boolean
}

export interface UpdateGameStatusRequest {
  status: GameStatus
  resetProgress?: boolean
}

export interface UpsertBaseRequest {
  name: string
  description?: string
  lat: number
  lng: number
  fixedChallengeId?: EntityId | null
  hidden?: boolean
  tagIds?: EntityId[] | null
}

export interface UpsertChallengeRequest {
  title: string
  description?: string
  content?: string
  completionContent?: string
  answerType?: AnswerType
  autoValidate?: boolean
  correctAnswer?: string[]
  points?: number
  locationBound?: boolean
  fixedBaseId?: EntityId | null
  unlocksBaseIds?: EntityId[] | null
  requirePresenceToSubmit?: boolean
  operatorNotes?: string | null
  tagIds?: EntityId[] | null
}

export interface CreateTeamRequest {
  name: string
}

export interface UpdateTeamRequest {
  name: string
  color?: string | null
}

export interface CreateAssignmentRequest {
  baseId: EntityId
  challengeId: EntityId
  /** Null means all teams. */
  teamId?: EntityId | null
}

export interface CreateTagRequest {
  label: string
  /** Backend assigns the next palette swatch when omitted. */
  color?: string | null
}

export interface UpdateTagRequest {
  label?: string | null
  color?: string | null
}

// ---------------------------------------------------------------- rescue actions

export interface MarkCompletedRequest {
  challengeId: EntityId
  reason?: string | null
  pointsOverride?: number | null
}

export interface UnlockOverrideRequest {
  reason?: string | null
}

export interface BaseUnlockOverrideResponse {
  id: EntityId
  gameId: EntityId
  teamId: EntityId
  baseId: EntityId
  createdByOperatorId?: EntityId | null
  createdByDisplayName?: string | null
  reason?: string | null
  createdAt: IsoDateTime
}

// ---------------------------------------------------------------- team variables

export interface TeamVariable {
  key: string
  teamValues: Record<EntityId, string>
}

export interface TeamVariablesResponse {
  variables: TeamVariable[]
}

export interface TeamVariablesCompletenessResponse {
  complete: boolean
  errors: string[]
}

// ---------------------------------------------------------------- invites and orgs

export interface InviteRequest {
  email: string
  gameId?: EntityId | null
}

export interface InviteResponse {
  id: EntityId
  gameId?: EntityId | null
  gameName?: string | null
  email: string
  status: 'pending' | 'accepted' | 'expired'
  invitedBy: EntityId
  inviterName?: string | null
  createdAt?: IsoDateTime | null
}

export interface Workspace {
  id: EntityId
  name: string
  kind: string
}

// ---------------------------------------------------------------- realtime

export type RealtimeEventType =
  | 'activity'
  | 'game_config'
  | 'game_status'
  | 'location'
  | 'notification'
  | 'presence'
  | 'stage_unlock'
  | 'leaderboard'
  | 'submission_status'

export interface RealtimeEnvelope<T = unknown> {
  version: number
  type: RealtimeEventType | (string & {})
  gameId?: EntityId | null
  emittedAt?: IsoDateTime | null
  /** Present on state-mutating events. Compare with snapshot.stateVersion. */
  stateVersion?: number | null
  data?: T
}

// ---------------------------------------------------------------- errors

export interface ApiErrorBody {
  status?: number
  message?: string
  code?: string
  errors?: Record<string, string>
  timestamp?: string
}
