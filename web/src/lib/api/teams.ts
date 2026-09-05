import type { Team, Player, Submission } from "@/types";
import apiClient from "./client";

export interface CreateTeamDto {
  name: string;
}

export interface UpdateTeamDto {
  name: string;
  color?: string;
}

/**
 * Optional body for the operator manual check-in endpoint
 * ({@code POST /games/:gameId/teams/:teamId/check-in/:baseId}).
 *
 * The backend DTO is `OperatorCheckInRequest` — the body is OPTIONAL,
 * legacy clients that POST with no body still work. When supplied, the
 * `reason` flows into the audit trail on `check_ins.operator_reason`.
 * Max length 500 characters (mirrors backend `@Size(max = 500)`).
 */
export interface OperatorCheckInRequest {
  reason?: string;
}

/**
 * Body for the operator rescue "mark completed" endpoint
 * ({@code POST /games/:gameId/teams/:teamId/bases/:baseId/mark-completed}).
 *
 * Synthesizes an APPROVED submission on the operator's behalf. Backend
 * DTO: `MarkCompletedRequest`. `reason` is capped at 500 chars on the
 * backend (`@Size(max = 500)`); `pointsOverride` defaults to the
 * challenge's configured `points` when null.
 */
export interface MarkCompletedRequest {
  challengeId: string;
  reason?: string;
  pointsOverride?: number;
}

/**
 * Optional body for the unlock-override create and remove endpoints.
 * Backend DTO: `UnlockOverrideRequest`. Body is optional on both POST
 * and DELETE verbs.
 */
export interface UnlockOverrideRequest {
  reason?: string;
}

/**
 * Projection of a {@code BaseUnlockOverride} returned by the operator
 * rescue endpoints. Mirrors the backend DTO
 * `BaseUnlockOverrideResponse` verified against the controller source
 * in commit `ca64e42`. Do NOT add fields here that aren't on the
 * backend DTO — structural drift will break the contract.
 */
export interface BaseUnlockOverrideResponse {
  id: string;
  gameId: string;
  teamId: string;
  baseId: string;
  createdByOperatorId: string | null;
  createdByDisplayName: string | null;
  reason: string | null;
  createdAt: string;
}

export const teamsApi = {
  listByGame: async (gameId: string): Promise<Team[]> => {
    const { data } = await apiClient.get(`/games/${gameId}/teams`);
    return data;
  },

  create: async (data: CreateTeamDto & { gameId: string }): Promise<Team> => {
    const { gameId, ...body } = data;
    const { data: result } = await apiClient.post(`/games/${gameId}/teams`, body);
    return result;
  },

  update: async (id: string, gameId: string, data: UpdateTeamDto): Promise<Team> => {
    const { data: result } = await apiClient.put(`/games/${gameId}/teams/${id}`, data);
    return result;
  },

  delete: async (id: string, gameId: string): Promise<void> => {
    await apiClient.delete(`/games/${gameId}/teams/${id}`);
  },

  getPlayers: async (teamId: string, gameId?: string): Promise<Player[]> => {
    if (!gameId) return [];
    const { data } = await apiClient.get(`/games/${gameId}/teams/${teamId}/players`);
    return data;
  },

  removePlayer: async (teamId: string, playerId: string, gameId?: string): Promise<void> => {
    if (!gameId) return;
    await apiClient.delete(`/games/${gameId}/teams/${teamId}/players/${playerId}`);
  },

  /**
   * Operator manual check-in rescue. The `body` parameter is optional
   * for backwards-compatibility with existing call-sites that do not
   * supply a reason; when omitted the backend records
   * `operator_reason = NULL` exactly as before.
   */
  manualCheckIn: async (
    gameId: string,
    teamId: string,
    baseId: string,
    body?: OperatorCheckInRequest,
  ): Promise<void> => {
    await apiClient.post(
      `/games/${gameId}/teams/${teamId}/check-in/${baseId}`,
      body ?? {},
    );
  },

  /**
   * Operator rescue — synthesize an approved submission for the team at
   * the given base. Returns the resulting {@link Submission}. The
   * backend endpoint returns 201 Created on first call and 200 OK on
   * idempotent re-call (same operator + team + base + challenge); both
   * are surfaced here as the same promise.
   */
  markCompleted: async (
    gameId: string,
    teamId: string,
    baseId: string,
    request: MarkCompletedRequest,
  ): Promise<Submission> => {
    const { data } = await apiClient.post(
      `/games/${gameId}/teams/${teamId}/bases/${baseId}/mark-completed`,
      request,
    );
    return data;
  },

  /**
   * Operator rescue — create (or return the existing active) unlock
   * override making the hidden base visible to the team.
   */
  createUnlockOverride: async (
    gameId: string,
    teamId: string,
    baseId: string,
    body?: UnlockOverrideRequest,
  ): Promise<BaseUnlockOverrideResponse> => {
    const { data } = await apiClient.post(
      `/games/${gameId}/teams/${teamId}/bases/${baseId}/unlock-override`,
      body ?? {},
    );
    return data;
  },

  /**
   * Operator rescue — soft-delete the active unlock override for the
   * (team, base) pair. Resolves with void on 204 No Content.
   */
  removeUnlockOverride: async (
    gameId: string,
    teamId: string,
    baseId: string,
    body?: UnlockOverrideRequest,
  ): Promise<void> => {
    await apiClient.delete(
      `/games/${gameId}/teams/${teamId}/bases/${baseId}/unlock-override`,
      { data: body ?? {} },
    );
  },

  /**
   * Operator rescue — list active unlock overrides for the team. Used
   * by the team detail page to show which hidden bases have been
   * force-unlocked for this team.
   */
  listUnlockOverrides: async (
    gameId: string,
    teamId: string,
  ): Promise<BaseUnlockOverrideResponse[]> => {
    const { data } = await apiClient.get(
      `/games/${gameId}/teams/${teamId}/unlock-overrides`,
    );
    return data;
  },
};
