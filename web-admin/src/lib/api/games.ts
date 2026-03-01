import type { AnswerType, Game, GameStatus, User } from "@/types";
import apiClient from "./client";

export interface CreateGameDto {
  name: string;
  description: string;
  startDate?: string;
  endDate?: string;
  uniformAssignment?: boolean;
}

export interface GameImportData {
  gameData: GameExportDto;
  startDate?: string;
  endDate?: string;
}

export interface GameMetadataExportDto {
  name: string;
  description: string;
  uniformAssignment?: boolean;
}

export interface BaseExportDto {
  tempId: string;
  name: string;
  description?: string;
  lat: number;
  lng: number;
  hidden?: boolean;
  requirePresenceToSubmit?: boolean;
  fixedChallengeTempId?: string | null;
}

export interface ChallengeExportDto {
  tempId: string;
  title: string;
  description?: string;
  content?: string;
  completionContent?: string;
  answerType: AnswerType;
  autoValidate?: boolean;
  correctAnswer?: string[];
  points: number;
  locationBound?: boolean;
}

export interface TeamExportDto {
  tempId: string;
  name: string;
  color: string;
}

export interface AssignmentExportDto {
  baseTempId: string;
  challengeTempId: string;
  teamTempId?: string | null;
}

export interface GameExportDto {
  exportVersion: string;
  exportedAt?: string;
  game: GameMetadataExportDto;
  bases: BaseExportDto[];
  challenges: ChallengeExportDto[];
  assignments: AssignmentExportDto[];
  teams?: TeamExportDto[];
}

export function isGameExportDto(value: unknown): value is GameExportDto {
  if (!value || typeof value !== "object") return false;

  const data = value as Record<string, unknown>;
  const game = data.game as Record<string, unknown> | undefined;

  return (
    typeof data.exportVersion === "string" &&
    !!game &&
    typeof game.name === "string" &&
    Array.isArray(data.bases) &&
    Array.isArray(data.challenges) &&
    Array.isArray(data.assignments)
  );
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

  getOperators: async (gameId: string): Promise<User[]> => {
    const { data } = await apiClient.get(`/games/${gameId}/operators`);
    return data;
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
