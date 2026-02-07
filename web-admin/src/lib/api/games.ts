import type { Game, GameStatus } from "@/types";
import apiClient from "./client";

export interface CreateGameDto {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
}

export const gamesApi = {
  list: async (): Promise<Game[]> => {
    const { data } = await apiClient.get("/games");
    return data;
  },

  getById: async (id: string): Promise<Game> => {
    const { data } = await apiClient.get(`/games/${id}`);
    return data;
  },

  create: async (dto: CreateGameDto): Promise<Game> => {
    const { data } = await apiClient.post("/games", {
      ...dto,
      startDate: new Date(dto.startDate).toISOString(),
      endDate: new Date(dto.endDate).toISOString(),
    });
    return data;
  },

  update: async (id: string, dto: Partial<CreateGameDto>): Promise<Game> => {
    const payload = { ...dto };
    if (payload.startDate) payload.startDate = new Date(payload.startDate).toISOString();
    if (payload.endDate) payload.endDate = new Date(payload.endDate).toISOString();
    const { data } = await apiClient.put(`/games/${id}`, payload);
    return data;
  },

  updateStatus: async (id: string, status: GameStatus): Promise<Game> => {
    const { data } = await apiClient.patch(`/games/${id}/status`, { status });
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/games/${id}`);
  },

  addOperator: async (gameId: string, userId: string): Promise<void> => {
    await apiClient.post(`/games/${gameId}/operators/${userId}`);
  },

  removeOperator: async (gameId: string, userId: string): Promise<void> => {
    await apiClient.delete(`/games/${gameId}/operators/${userId}`);
  },
};
