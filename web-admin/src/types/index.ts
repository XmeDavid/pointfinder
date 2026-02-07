export type UserRole = "admin" | "operator";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export type GameStatus = "draft" | "live" | "ended";

export interface Game {
  id: string;
  name: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  status: GameStatus;
  createdBy: string;
  operatorIds: string[];
}

export interface Base {
  id: string;
  gameId: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
  nfcLinked: boolean;
  fixedChallengeId?: string;
}

export type AnswerType = "text" | "file";

export interface Challenge {
  id: string;
  gameId: string;
  title: string;
  description: string;
  content: string;
  answerType: AnswerType;
  autoValidate: boolean;
  correctAnswer?: string;
  points: number;
  locationBound: boolean;
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
  | "correct"
  | "incorrect";

export interface Submission {
  id: string;
  teamId: string;
  challengeId: string;
  baseId: string;
  answer: string;
  status: SubmissionStatus;
  submittedAt: string;
  reviewedBy?: string;
  feedback?: string;
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
  email: string;
  token: string;
  status: InviteStatus;
  invitedBy: string;
  createdAt: string;
}

export interface TeamLocation {
  teamId: string;
  lat: number;
  lng: number;
  updatedAt: string;
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
