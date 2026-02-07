import type { GameNotification } from "@/types";
import apiClient from "./client";

export interface SendNotificationDto {
  message: string;
  targetTeamId?: string;
}

export const notificationsApi = {
  listByGame: async (gameId: string): Promise<GameNotification[]> => {
    const { data } = await apiClient.get(`/games/${gameId}/notifications`);
    return data;
  },

  send: async (data: SendNotificationDto & { gameId: string }): Promise<GameNotification> => {
    const { gameId, ...body } = data;
    const { data: result } = await apiClient.post(`/games/${gameId}/notifications`, body);
    return result;
  },
};
