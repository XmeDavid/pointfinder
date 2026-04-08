import type { ActivityEvent, TeamLocation, TeamBaseProgress } from "@/types";
import apiClient from "./client";

export const monitoringApi = {
  getActivityEvents: async (gameId: string): Promise<ActivityEvent[]> => {
    const { data } = await apiClient.get(`/games/${gameId}/monitoring/activity`);
    return data;
  },

  getTeamLocations: async (gameId: string): Promise<TeamLocation[]> => {
    const { data } = await apiClient.get(`/games/${gameId}/monitoring/locations`);
    return data;
  },

  getProgress: async (gameId: string): Promise<TeamBaseProgress[]> => {
    const { data } = await apiClient.get(`/games/${gameId}/monitoring/progress`);
    return data;
  },

  getLeaderboard: async (
    gameId: string
  ): Promise<{ teamId: string; teamName: string; color: string; points: number; completedChallenges: number }[]> => {
    const { data } = await apiClient.get(`/games/${gameId}/monitoring/leaderboard`);
    return data;
  },

  getDashboardStats: async (
    gameId: string
  ): Promise<{
    totalTeams: number;
    totalBases: number;
    totalChallenges: number;
    pendingSubmissions: number;
    completedSubmissions: number;
    totalSubmissions: number;
    startDate: string;
    endDate: string;
  }> => {
    const { data } = await apiClient.get(`/games/${gameId}/monitoring/dashboard`);
    return data;
  },

  getResultsExport: async (
    gameId: string
  ): Promise<{
    gameName: string;
    challenges: { id: string; title: string; maxPoints: number }[];
    teams: { teamId: string; teamName: string; color: string; totalPoints: number; challengePoints: Record<string, number> }[];
  }> => {
    const { data } = await apiClient.get(`/games/${gameId}/monitoring/results-export`);
    return data;
  },

  /**
   * Realtime health stats for the operator dashboard widget.
   * P0 Track 2 Slice 5 — `GET /api/games/:gameId/realtime-stats`.
   */
  getRealtimeStats: async (gameId: string): Promise<RealtimeStats> => {
    const { data } = await apiClient.get(`/games/${gameId}/realtime-stats`);
    return data;
  },
};

export interface RealtimeStats {
  stompActiveSessions: number;
  mobileActiveSessions: number;
  totalActiveSessions: number;
  stompConnectsLastHour: number;
  mobileConnectsLastHour: number;
  stompDisconnectsLastHour: number;
  mobileDisconnectsLastHour: number;
  estimatedReconnectsLastHour: number;
  lastUpdated: string;
}
