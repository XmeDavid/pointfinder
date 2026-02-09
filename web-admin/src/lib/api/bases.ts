import type { Base } from "@/types";
import apiClient from "./client";

export interface CreateBaseDto {
  name: string;
  description: string;
  lat: number;
  lng: number;
  fixedChallengeId?: string;
  requirePresenceToSubmit?: boolean;
}

export const basesApi = {
  listByGame: async (gameId: string): Promise<Base[]> => {
    const { data } = await apiClient.get(`/games/${gameId}/bases`);
    return data;
  },

  create: async (data: CreateBaseDto & { gameId: string }): Promise<Base> => {
    const { gameId, ...body } = data;
    const { data: result } = await apiClient.post(`/games/${gameId}/bases`, body);
    return result;
  },

  update: async (id: string, data: Partial<CreateBaseDto> & { nfcLinked?: boolean; requirePresenceToSubmit?: boolean; gameId: string }): Promise<Base> => {
    const { gameId, ...body } = data;
    const { data: result } = await apiClient.put(`/games/${gameId}/bases/${id}`, body);
    return result;
  },

  delete: async (id: string, gameId: string): Promise<void> => {
    await apiClient.delete(`/games/${gameId}/bases/${id}`);
  },
};
