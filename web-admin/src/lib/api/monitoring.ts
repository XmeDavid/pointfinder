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
  }> => {
    const { data } = await apiClient.get(`/games/${gameId}/monitoring/dashboard`);
    return data;
  },
};
