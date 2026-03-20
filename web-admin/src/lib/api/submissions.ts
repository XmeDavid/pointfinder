import type { Submission, SubmissionStatus } from "@/types";
import apiClient from "./client";

export const submissionsApi = {
  listByGame: async (gameId: string): Promise<Submission[]> => {
    const { data } = await apiClient.get(`/games/${gameId}/submissions`);
    return data;
  },

  listByTeam: async (teamId: string, gameId: string): Promise<Submission[]> => {
    const { data } = await apiClient.get(`/games/${gameId}/submissions`, {
      params: { teamId },
    });
    return data;
  },

  review: async (
    id: string,
    status: SubmissionStatus,
    feedback?: string,
    gameId?: string,
    points?: number
  ): Promise<Submission> => {
    const { data } = await apiClient.patch(
      `/games/${gameId}/submissions/${id}/review`,
      { status, feedback, points }
    );
    return data;
  },
};
