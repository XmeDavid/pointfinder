import type { Team, Player } from "@/types";
import apiClient from "./client";

export interface CreateTeamDto {
  name: string;
}

export interface UpdateTeamDto {
  name: string;
  color?: string;
}

export const teamsApi = {
  listByGame: async (gameId: string): Promise<Team[]> => {
    const { data } = await apiClient.get(`/games/${gameId}/teams`);
    return data;
  },

  create: async (data: CreateTeamDto & { gameId: string }): Promise<Team> => {
    const { gameId, ...body } = data;
    const { data: result } = await apiClient.post(`/games/${gameId}/teams`, body);
    return result;
  },

  update: async (id: string, gameId: string, data: UpdateTeamDto): Promise<Team> => {
    const { data: result } = await apiClient.put(`/games/${gameId}/teams/${id}`, data);
    return result;
  },

  delete: async (id: string, gameId: string): Promise<void> => {
    await apiClient.delete(`/games/${gameId}/teams/${id}`);
  },

  getPlayers: async (teamId: string, gameId?: string): Promise<Player[]> => {
    if (!gameId) return [];
    const { data } = await apiClient.get(`/games/${gameId}/teams/${teamId}/players`);
    return data;
  },

  removePlayer: async (teamId: string, playerId: string, gameId?: string): Promise<void> => {
    if (!gameId) return;
    await apiClient.delete(`/games/${gameId}/teams/${teamId}/players/${playerId}`);
  },

  manualCheckIn: async (gameId: string, teamId: string, baseId: string): Promise<void> => {
    await apiClient.post(`/games/${gameId}/teams/${teamId}/check-in/${baseId}`);
  },
};
