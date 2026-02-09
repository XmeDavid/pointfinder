import type { Game, GameStatus } from "@/types";
import apiClient from "./client";

export interface CreateGameDto {
  name: string;
  description: string;
  startDate?: string;
  endDate?: string;
}

export interface GameImportData {
  gameData: any;
  startDate?: string;
  endDate?: string;
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
      startDate: dto.startDate ? new Date(dto.startDate).toISOString() : null,
      endDate: dto.endDate ? new Date(dto.endDate).toISOString() : null,
    });
    return data;
  },

  update: async (id: string, dto: Partial<CreateGameDto>): Promise<Game> => {
    const payload: Record<string, unknown> = { ...dto };
    if (payload.startDate) payload.startDate = new Date(payload.startDate as string).toISOString();
    else if (payload.startDate === "") payload.startDate = null;
    if (payload.endDate) payload.endDate = new Date(payload.endDate as string).toISOString();
    else if (payload.endDate === "") payload.endDate = null;
    const { data } = await apiClient.put(`/games/${id}`, payload);
    return data;
  },

  updateStatus: async (id: string, status: GameStatus, resetProgress = false): Promise<Game> => {
    const { data } = await apiClient.patch(`/games/${id}/status`, { status, resetProgress });
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

  exportGame: async (id: string): Promise<Blob> => {
    const { data } = await apiClient.get(`/games/${id}/export`, {
      responseType: 'blob',
    });
    return data;
  },

  importGame: async (importData: GameImportData): Promise<Game> => {
    const { data } = await apiClient.post("/games/import", importData);
    return data;
  },
};
