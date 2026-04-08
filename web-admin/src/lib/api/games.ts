import type {
  AnswerType,
  Game,
  GameStatus,
  OperatorSnapshotResponse,
  User,
} from "@/types";
import apiClient from "./client";
import { getApiErrorMessage } from "./errors";

export interface CreateGameDto {
  name: string;
  description: string;
  startDate?: string;
  endDate?: string;
  uniformAssignment?: boolean;
  broadcastEnabled?: boolean;
  tileSource?: string;
  unlockTrigger?: string;
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
  tileSource?: string;
}

export interface BaseExportDto {
  tempId: string;
  name: string;
  description?: string;
  lat: number;
  lng: number;
  hidden?: boolean;
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
  requirePresenceToSubmit?: boolean;
  unlocksBaseTempIds?: string[];
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

export interface TeamVariableExportDto {
  teamTempId: string;
  variableKey: string;
  variableValue: string;
}

export interface ChallengeTeamVariableExportDto {
  challengeTempId: string;
  teamTempId: string;
  variableKey: string;
  variableValue: string;
}

export interface GameExportDto {
  exportVersion: string;
  exportedAt?: string;
  game: GameMetadataExportDto;
  bases: BaseExportDto[];
  challenges: ChallengeExportDto[];
  assignments: AssignmentExportDto[];
  teams?: TeamExportDto[];
  teamVariables?: TeamVariableExportDto[];
  challengeTeamVariables?: ChallengeTeamVariableExportDto[];
}

export function isGameExportDto(value: unknown): value is GameExportDto {
  if (!value || typeof value !== "object") return false;

  const data = value as Record<string, unknown>;
  const game = data.game as Record<string, unknown> | undefined;

  return (
    typeof data.exportVersion === "string" &&
    !!game &&
    typeof game.name === "string" &&
    typeof game.description === "string" &&
    Array.isArray(data.bases) &&
    Array.isArray(data.challenges) &&
    Array.isArray(data.assignments) &&
    data.bases.every((b: unknown) => typeof (b as Record<string, unknown>).tempId === "string" && typeof (b as Record<string, unknown>).name === "string" && typeof (b as Record<string, unknown>).lat === "number" && typeof (b as Record<string, unknown>).lng === "number") &&
    data.challenges.every((c: unknown) => typeof (c as Record<string, unknown>).tempId === "string" && typeof (c as Record<string, unknown>).title === "string" && typeof (c as Record<string, unknown>).points === "number" && typeof (c as Record<string, unknown>).answerType === "string") &&
    data.assignments.every((a: unknown) => typeof (a as Record<string, unknown>).baseTempId === "string" && typeof (a as Record<string, unknown>).challengeTempId === "string")
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

  /**
   * Canonical "give me the current state of this game" call.
   *
   * Operators reach for this on tab re-focus, WebSocket reconnect, or any
   * time cached dashboard state may have drifted. The backend endpoint
   * branches on caller role; operator JWTs get `OperatorSnapshotResponse`,
   * player JWTs get `PlayerSnapshotResponse`. The web admin only ever calls
   * this as an operator, so the return type is narrowed accordingly.
   *
   * See docs/realtime-and-mobile.md §7 "State Snapshot Contract".
   */
  getSnapshot: async (id: string): Promise<OperatorSnapshotResponse> => {
    const { data } = await apiClient.get(`/games/${id}/snapshot`);
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
    try {
      const { data } = await apiClient.get(`/games/${id}/export`, {
        responseType: "blob",
      });
      return data;
    } catch (error) {
      // Axios keeps error bodies as Blob when responseType: "blob".
      // Re-hydrate so getApiErrorMessage sees the real server message.
      const anyErr = error as { response?: { data?: unknown } };
      if (anyErr.response?.data instanceof Blob) {
        try {
          const text = await anyErr.response.data.text();
          anyErr.response.data = JSON.parse(text);
        } catch {
          // If the blob isn't JSON, leave it — caller falls back to generic message
        }
      }
      (error as Record<string, unknown>)._friendlyMessage = getApiErrorMessage(error);
      throw error;
    }
  },

  importGame: async (importData: GameImportData): Promise<Game> => {
    const { data } = await apiClient.post("/games/import", importData);
    return data;
  },
};
