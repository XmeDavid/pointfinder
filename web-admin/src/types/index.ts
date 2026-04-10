export type UserRole = "admin" | "operator";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export type GameStatus = "setup" | "live" | "ended";

/**
 * Game-scoped tag with a baked-in color.
 * Operator-only — never exposed to players.
 * Mirrors backend TagResponse DTO.
 */
export interface Tag {
  id: string;
  gameId: string;
  label: string;
  /** 7-char hex, e.g. "#3b82f6" */
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface Game {
  id: string;
  name: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  status: GameStatus;
  createdBy: string;
  operatorIds: string[];
  uniformAssignment: boolean;
  broadcastEnabled: boolean;
  broadcastCode: string | null;
  tileSource: string;
  unlockTrigger: string;
  /**
   * Game-scoped tag vocabulary. Operator-only.
   * Populated by GET /api/games/{gameId}/tags — NOT embedded in GameResponse
   * today, so this is filled by a separate query in useGameTagsMap.
   */
  tags?: Tag[];
}

export interface Base {
  id: string;
  gameId: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
  nfcLinked: boolean;
  hidden: boolean;
  fixedChallengeId?: string;
  /**
   * Operator-only game-scoped tag IDs (Wave B unification). Resolved against
   * the game's tag vocabulary via `useGameTagsMap`. Only present on the
   * operator-facing `BaseResponse` DTO — the player-facing
   * `PlayerBaseResponse` intentionally omits this field, and a backend test
   * enforces the absence.
   */
  tagIds?: string[];
  /** Stage this base belongs to (v2 stages feature) */
  stageId?: string | null;
}

export type AnswerType = "text" | "file" | "none";

export interface Challenge {
  id: string;
  gameId: string;
  title: string;
  description: string;
  content: string;
  completionContent: string;
  answerType: AnswerType;
  autoValidate: boolean;
  correctAnswer?: string[];
  points: number;
  locationBound: boolean;
  unlocksBaseIds?: string[];
  requirePresenceToSubmit: boolean;
  /**
   * Operator-only free-text notes. Only present on the operator-facing
   * `ChallengeResponse` DTO from `GET /api/games/{gameId}/challenges`.
   * The player-facing `PlayerChallengeResponse` served via
   * `GET /api/player/games/{gameId}/data` intentionally omits this
   * field, and a backend test enforces the absence.
   */
  operatorNotes?: string;
  /**
   * Operator-only game-scoped tag IDs (Wave B unification). Resolved against
   * the game's tag vocabulary via `useGameTagsMap`. Same privacy contract as
   * `operatorNotes` — never returned on player-facing endpoints.
   */
  tagIds?: string[];
}

export interface Team {
  id: string;
  gameId: string;
  name: string;
  joinCode: string;
  color: string;
}

export interface Player {
  id: string;
  teamId: string;
  deviceId: string;
  displayName: string;
}

export interface Assignment {
  id: string;
  gameId: string;
  baseId: string;
  challengeId: string;
  teamId?: string; // null = all teams
}

export type SubmissionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "correct";

export interface Submission {
  id: string;
  teamId: string;
  challengeId: string;
  baseId: string;
  answer: string;
  fileUrl?: string;
  fileUrls?: string[];
  status: SubmissionStatus;
  submittedAt: string;
  reviewedBy?: string;
  feedback?: string;
  points?: number;
  completionContent?: string;
}

export interface GameNotification {
  id: string;
  gameId: string;
  message: string;
  targetTeamId?: string;
  sentAt: string;
  sentBy: string;
}

export type InviteStatus = "pending" | "accepted" | "expired";

export interface OperatorInvite {
  id: string;
  gameId?: string;
  gameName?: string;
  email: string;
  status: InviteStatus;
  invitedBy: string;
  inviterName?: string;
  createdAt: string;
}

export interface TeamLocation {
  teamId: string;
  playerId: string;
  displayName: string;
  lat: number;
  lng: number;
  updatedAt: string;
}

export type BaseStatus = "not_visited" | "checked_in" | "submitted" | "completed" | "rejected";

export interface TeamBaseProgress {
  baseId: string;
  teamId: string;
  status: BaseStatus;
  checkedInAt?: string;
  challengeId?: string;
  submissionStatus?: string;
}

export interface ActivityEvent {
  id: string;
  gameId: string;
  type: "check_in" | "submission" | "approval" | "rejection";
  teamId: string;
  baseId?: string;
  challengeId?: string;
  message: string;
  timestamp: string;
}

// ─── State Snapshot Contract (P0 Track 2 Slices 1-3) ─────────────────────────
// Mirrors backend DTOs at:
//   backend/src/main/java/com/prayer/pointfinder/dto/response/OperatorSnapshotResponse.java
//   backend/src/main/java/com/prayer/pointfinder/dto/response/PlayerSnapshotResponse.java
// Any structural drift between these types and the backend DTOs is a bug.
// See docs/realtime-and-mobile.md §7 "State Snapshot Contract".

export interface SnapshotLeaderboardEntry {
  teamId: string;
  teamName: string;
  color: string;
  points: number;
  completedChallenges: number;
}

export interface OperatorSnapshotGameInfo {
  id: string;
  name: string;
  description: string;
  /** Canonical game status: "setup", "live", or "ended". */
  status: GameStatus;
  /** "CHECK_IN", "SUBMISSION", or "COMPLETED". */
  unlockTrigger: string;
  tileSource: string;
  startDate: string | null;
  endDate: string | null;
  uniformAssignment: boolean | null;
  broadcastEnabled: boolean | null;
  broadcastCode: string | null;
}

export interface OperatorSnapshotTeamInfo {
  id: string;
  name: string;
  color: string;
  score: number;
  memberCount: number;
}

export interface OperatorSnapshotResponse {
  /**
   * Monotonically-increasing state version. Bumped by the backend on every
   * state-mutating, snapshot-relevant broadcast. Compare against the
   * `stateVersion` carried on realtime envelopes to decide whether to replace
   * cached state wholesale.
   */
  stateVersion: number;
  /** Server-side wall clock at the moment the snapshot was built. */
  serverTime: string;
  game: OperatorSnapshotGameInfo;
  teams: OperatorSnapshotTeamInfo[];
  leaderboard: SnapshotLeaderboardEntry[];
  /** Count of submissions currently in `pending` status. */
  pendingReviews: number;
  /** Count of upload sessions currently active and not yet expired. */
  activeUploads: number;
  /** Count of completed-but-unlinked upload sessions past the needs-attention threshold. */
  needsAttention: number;
}

// Player snapshot — deliberately carries NO scoring information at any
// nesting depth. See PlayerSnapshotResponse.java for the product rule.

export interface PlayerSnapshotGameInfo {
  id: string;
  name: string;
  description: string;
  status: GameStatus;
  unlockTrigger: string;
  tileSource: string;
  startDate: string | null;
  endDate: string | null;
}

export interface PlayerSnapshotTeamInfo {
  id: string;
  name: string;
  color: string;
  memberCount: number;
  // NO score field. Players do not see scores.
}

export interface PlayerSnapshotSubmissionSummary {
  id: string;
  baseId: string;
  challengeId: string;
  /** "pending", "approved", "rejected", "correct", "incorrect". NO points. */
  status: string;
  submittedAt: string;
  fileUrl?: string;
  fileUrls?: string[];
}

export interface PlayerSnapshotResponse {
  stateVersion: number;
  serverTime: string;
  game: PlayerSnapshotGameInfo;
  team: PlayerSnapshotTeamInfo;
  progress: unknown[];
  submissions: PlayerSnapshotSubmissionSummary[];
  uploadSessions: unknown[];
}
