import type { Team, Player } from "@/types";
import apiClient from "./client";

export interface CreateTeamDto {
  name: string;
}

export interface UpdateTeamDto {
  name: string;
}

export const teamsApi = {
  listByGame: async (gameId: string): Promise<Team[]> => {
    const { data } = await apiClient.get(`/games/${gameId}/teams`);
    return data;
  },

  getById: async (id: string): Promise<Team> => {
    // Fetch from all games' teams - we need to find the team and its game
    // The team response includes gameId, so we can find it
    // For now, we'll accept the gameId being passed optionally
    throw new Error("Use listByGame and filter instead");
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
};
