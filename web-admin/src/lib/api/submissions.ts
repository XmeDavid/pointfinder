import type { Submission, SubmissionStatus } from "@/types";
import apiClient from "./client";

export const submissionsApi = {
  listByGame: async (gameId: string): Promise<Submission[]> => {
    const { data } = await apiClient.get(`/games/${gameId}/submissions`);
    return data;
  },

  listByTeam: async (teamId: string, gameId: string): Promise<Submission[]> => {
    // We use the game-level endpoint and the backend filters by team in the response
    const { data } = await apiClient.get(`/games/${gameId}/submissions`);
    return (data as Submission[]).filter((s) => s.teamId === teamId);
  },

  review: async (
    id: string,
    status: SubmissionStatus,
    _reviewedBy: string,
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
