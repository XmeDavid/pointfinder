import type { Assignment } from "@/types";
import apiClient from "./client";

export interface CreateAssignmentDto {
  baseId: string;
  challengeId: string;
  teamId?: string;
}

export const assignmentsApi = {
  listByGame: async (gameId: string): Promise<Assignment[]> => {
    const { data } = await apiClient.get(`/games/${gameId}/assignments`);
    return data;
  },

  create: async (data: CreateAssignmentDto & { gameId: string }): Promise<Assignment> => {
    const { gameId, ...body } = data;
    const { data: result } = await apiClient.post(`/games/${gameId}/assignments`, body);
    return result;
  },

  delete: async (id: string, gameId: string): Promise<void> => {
    await apiClient.delete(`/games/${gameId}/assignments/${id}`);
  },

  bulkSet: async (gameId: string, assignments: Omit<Assignment, "id">[]): Promise<Assignment[]> => {
    const body = {
      assignments: assignments.map((a) => ({
        baseId: a.baseId,
        challengeId: a.challengeId,
        teamId: a.teamId,
      })),
    };
    const { data } = await apiClient.put(`/games/${gameId}/assignments`, body);
    return data;
  },
};
