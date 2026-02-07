import type { OperatorInvite } from "@/types";
import apiClient from "./client";

export interface CreateInviteDto {
  email: string;
  gameId?: string;
}

export const invitesApi = {
  list: async (): Promise<OperatorInvite[]> => {
    const { data } = await apiClient.get("/invites");
    return data;
  },

  listByGame: async (gameId: string): Promise<OperatorInvite[]> => {
    const { data } = await apiClient.get(`/invites/game/${gameId}`);
    return data;
  },

  getMyInvites: async (): Promise<OperatorInvite[]> => {
    const { data } = await apiClient.get("/invites/my");
    return data;
  },

  create: async (data: CreateInviteDto): Promise<OperatorInvite> => {
    const { data: result } = await apiClient.post("/invites", data);
    return result;
  },

  accept: async (inviteId: string): Promise<void> => {
    await apiClient.post(`/invites/${inviteId}/accept`);
  },
};
