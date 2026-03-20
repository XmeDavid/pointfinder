import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "/api";

// Intentionally uses a separate axios instance (not the shared apiClient) because
// broadcast endpoints are public and unauthenticated — they must not go through
// the auth interceptors that attach Bearer tokens or trigger token refresh.
const broadcastClient = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

export interface BroadcastLeaderboardEntry {
  teamId: string;
  teamName: string;
  color: string;
  points: number;
  completedChallenges: number;
}

export interface BroadcastTeam {
  id: string;
  name: string;
  color: string;
}

export interface BroadcastBase {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface BroadcastLocation {
  teamId: string;
  playerId: string;
  displayName: string;
  lat: number;
  lng: number;
  updatedAt: string;
}

export interface BroadcastProgress {
  baseId: string;
  teamId: string;
  status: string;
  checkedInAt?: string;
  challengeId?: string;
  submissionStatus?: string;
}

export interface BroadcastData {
  gameId: string;
  gameName: string;
  gameStatus: string;
  tileSource: string;
  leaderboard: BroadcastLeaderboardEntry[];
  teams: BroadcastTeam[];
  bases: BroadcastBase[];
  locations: BroadcastLocation[];
  progress: BroadcastProgress[];
}

export const broadcastApi = {
  getData: async (code: string): Promise<BroadcastData> => {
    const { data } = await broadcastClient.get(`/broadcast/${code}`);
    return data;
  },

  getLeaderboard: async (code: string): Promise<BroadcastLeaderboardEntry[]> => {
    const { data } = await broadcastClient.get(`/broadcast/${code}/leaderboard`);
    return data;
  },

  getLocations: async (code: string): Promise<BroadcastLocation[]> => {
    const { data } = await broadcastClient.get(`/broadcast/${code}/locations`);
    return data;
  },

  getProgress: async (code: string): Promise<BroadcastProgress[]> => {
    const { data } = await broadcastClient.get(`/broadcast/${code}/progress`);
    return data;
  },
};
