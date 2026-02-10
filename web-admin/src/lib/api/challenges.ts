import type { Challenge } from "@/types";
import apiClient from "./client";

export interface CreateChallengeDto {
  title: string;
  description: string;
  content: string;
  completionContent: string;
  answerType: "text" | "file";
  autoValidate: boolean;
  correctAnswer?: string;
  points: number;
  locationBound: boolean;
}

export const challengesApi = {
  listByGame: async (gameId: string): Promise<Challenge[]> => {
    const { data } = await apiClient.get(`/games/${gameId}/challenges`);
    return data;
  },

  create: async (data: CreateChallengeDto & { gameId: string }): Promise<Challenge> => {
    const { gameId, ...body } = data;
    const { data: result } = await apiClient.post(`/games/${gameId}/challenges`, body);
    return result;
  },

  update: async (id: string, data: Partial<CreateChallengeDto> & { gameId: string }): Promise<Challenge> => {
    const { gameId, ...body } = data;
    const { data: result } = await apiClient.put(`/games/${gameId}/challenges/${id}`, body);
    return result;
  },

  delete: async (id: string, gameId: string): Promise<void> => {
    await apiClient.delete(`/games/${gameId}/challenges/${id}`);
  },
};
