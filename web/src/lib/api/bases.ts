import type { Base, CheckInMethod } from "@/types";
import apiClient from "./client";

export interface CreateBaseDto {
  name: string;
  description: string;
  lat: number;
  lng: number;
  fixedChallengeId?: string;
  hidden?: boolean;
  /**
   * Operator-only game-scoped tag IDs (Wave B unification).
   * Never exposed to players — see backend `PlayerBaseResponse` for
   * the player-safe DTO and `PlayerControllerTest` for the enforcing
   * assertion.
   */
  tagIds?: string[];
  /** Stage this base belongs to (v2 stages feature) */
  stageId?: string | null;
  /** Omit on create to inherit the game default; explicit on update. */
  checkInMethod?: CheckInMethod;
  /** null clears the override so the base inherits the game default. */
  checkInRadiusM?: number | null;
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

  update: async (id: string, data: Partial<CreateBaseDto> & { nfcLinked?: boolean; hidden?: boolean; gameId: string }): Promise<Base> => {
    const { gameId, ...body } = data;
    const { data: result } = await apiClient.put(`/games/${gameId}/bases/${id}`, body);
    return result;
  },

  delete: async (id: string, gameId: string): Promise<void> => {
    await apiClient.delete(`/games/${gameId}/bases/${id}`);
  },

  /** Audited: records that a physical tag now carries this base's URL. */
  markNfcLinked: async (id: string, gameId: string): Promise<Base> => {
    const { data } = await apiClient.patch<Base>(`/games/${gameId}/bases/${id}/nfc-link`);
    return data;
  },
  reorder: async (gameId: string, ids: string[]): Promise<void> => {
    await apiClient.patch(`/games/${gameId}/bases/reorder`, { ids });
  },
};
