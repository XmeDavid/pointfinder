import type { AnswerType, Challenge, ChoiceOption } from "@/types";
import apiClient from "./client";

export interface CreateChallengeDto {
  title: string;
  description: string;
  content: string;
  completionContent: string;
  answerType: AnswerType;
  autoValidate: boolean;
  correctAnswer?: string[];
  /**
   * Required for single_choice and multiple_choice; ignored on other types.
   * The update replaces the options, so every call for a choice challenge
   * must carry them, ids included for the options that already exist.
   */
  choiceOptions?: ChoiceOption[] | null;
  points: number;
  locationBound: boolean;
  fixedBaseId?: string;
  unlocksBaseIds?: string[];
  requirePresenceToSubmit?: boolean;
  /**
   * Operator-only free-text notes, max 5000 characters. Never exposed
   * to players — see the backend `PlayerChallengeResponse` for the
   * player-safe DTO and `PlayerControllerTest` for the enforcing
   * assertion.
   */
  operatorNotes?: string;
  /**
   * Operator-only game-scoped tag IDs (Wave B unification).
   * Same privacy contract as `operatorNotes`.
   */
  tagIds?: string[];
  /**
   * Optional client-generated UUID, scoped per game. Resending it after an
   * uncertain outcome (offline, restart) returns the same challenge instead
   * of creating a duplicate. Also sent as the `Idempotency-Key` header.
   */
  idempotencyKey?: string;
}

export const challengesApi = {
  listByGame: async (gameId: string): Promise<Challenge[]> => {
    const { data } = await apiClient.get(`/games/${gameId}/challenges`);
    return data;
  },

  create: async (data: CreateChallengeDto & { gameId: string }): Promise<Challenge> => {
    const { gameId, ...body } = data;
    const { data: result } = await apiClient.post(
      `/games/${gameId}/challenges`,
      body,
      body.idempotencyKey ? { headers: { "Idempotency-Key": body.idempotencyKey } } : undefined,
    );
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

  reorder: async (gameId: string, ids: string[]): Promise<void> => {
    await apiClient.patch(`/games/${gameId}/challenges/reorder`, { ids });
  },
};
