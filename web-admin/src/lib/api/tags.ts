import type { Tag } from "@/types";
import apiClient from "./client";

export interface CreateTagDto {
  label: string;
  /** Optional — if omitted, service assigns next unused palette swatch. */
  color?: string;
}

export interface UpdateTagDto {
  label?: string;
  color?: string;
}

export const tagsApi = {
  listByGame: async (gameId: string): Promise<Tag[]> => {
    const { data } = await apiClient.get(`/games/${gameId}/tags`);
    return data;
  },

  createTag: async (gameId: string, dto: CreateTagDto): Promise<Tag> => {
    const { data } = await apiClient.post(`/games/${gameId}/tags`, dto);
    return data;
  },

  updateTag: async (gameId: string, tagId: string, dto: UpdateTagDto): Promise<Tag> => {
    const { data } = await apiClient.patch(`/games/${gameId}/tags/${tagId}`, dto);
    return data;
  },

  deleteTag: async (gameId: string, tagId: string): Promise<void> => {
    await apiClient.delete(`/games/${gameId}/tags/${tagId}`);
  },
};
