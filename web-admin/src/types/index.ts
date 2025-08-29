// Core Game Types
export interface Base {
  id: string;
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  uuid: string;
  isLocationDependent: boolean;
  nfcLinked: boolean;
  enigmaId?: string;
}

export interface Enigma {
  id: string;
  title: string;
  content: string;
  answer: string;
  points: number;
  isLocationDependent: boolean;
  baseId?: string;
  baseName?: string;
  mediaType?: "image" | "video" | "youtube";
  mediaUrl?: string;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  name: string;
  deviceId?: string;
}

export interface Team {
  id: string;
  name: string;
  number: number;
  inviteCode: string;
  members: string[]; // Array of member names for now
  leaderId?: string;
  createdAt: string;
  lastLocation?: {
    latitude: number;
    longitude: number;
    timestamp: string;
  };
  progress: TeamProgress[];
}

export interface TeamProgress {
  baseId: string;
  baseName: string;
  arrivedAt?: string;
  solvedAt?: string;
  completedAt?: string;
  score: number;
}

export interface Game {
  id: string;
  name: string;
  status: "setup" | "ready" | "live" | "finished";
  rulesHtml?: string;
  basesLinked: boolean;
  bases: Base[];
  teams: Team[];
  enigmas: Enigma[];
  createdAt: string;
  role?: string; // For operator access
}

// User Management Types
export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "operator";
}

export interface Operator {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  gameCount: number;
  status: "active" | "pending" | "inactive";
}

// Event Types
export interface GameEvent {
  id: string;
  type: string;
  teamId: string;
  teamName: string;
  message: string;
  createdAt: string;
}

// Location Tracking
export interface TeamLocation {
  teamId: string;
  teamName: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  deviceId: string;
  timestamp: string;
}

// API Response Types
export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
}

export interface GameStats {
  totalGames: number;
  activeGames: number;
  setupGames: number;
  finishedGames: number;
  totalOperators?: number;
  activeOperators?: number;
  pendingOperators?: number;
}

// Form Types
export interface CreateGameForm {
  name: string;
  rulesHtml?: string;
}

export interface CreateBaseForm {
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  isLocationDependent: boolean;
}

export interface CreateTeamForm {
  name: string;
  number?: number;
  inviteCode?: string;
}

export interface CreateEnigmaForm {
  title: string;
  content: string;
  answer: string;
  points: number;
  isLocationDependent: boolean;
  baseId?: string;
  mediaType?: "image" | "video" | "youtube";
  mediaUrl?: string;
}

export interface InviteOperatorForm {
  email: string;
  name: string;
}

// Modal Props Types
export interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}