import type { ActivityEvent, TeamLocation, TeamBaseProgress } from "@/types";
import apiClient from "./client";

/**
 * Filter set for the Phase 3 activity audit export endpoint
 * ({@code GET /games/:gameId/audit-export}). All fields are optional
 * and forwarded to the backend as query parameters via
 * {@link monitoringApi.exportAuditLog}. See
 * `docs/api-reference.md` § "Audit Export" for the full contract.
 *
 * - `format` — response body format; defaults to JSON backend-side.
 * - `from` / `to` — ISO-8601 timestamp bounds on `activity_events.timestamp`.
 * - `teamId` / `playerId` / `operatorId` — scope to a single actor.
 * - `actionType` — single action type or a comma-separated list
 *   (`check_in`, `submission`, `approval`, `rejection`,
 *   `operator_override`, `team_join`, `team_switch`).
 * - `sourceSurface` — `player_app` | `web_admin` | `operator_rescue`.
 * - `includeArchived` — when true, include rows preserved by
 *   `resetProgress=true` resets (defaults to false).
 */
export interface AuditExportFilters {
  format?: "json" | "csv";
  from?: string;
  to?: string;
  teamId?: string;
  playerId?: string;
  operatorId?: string;
  actionType?: string;
  sourceSurface?: string;
  includeArchived?: boolean;
}

export const monitoringApi = {
  getActivityEvents: async (gameId: string): Promise<ActivityEvent[]> => {
    const { data } = await apiClient.get(`/games/${gameId}/monitoring/activity`);
    return data;
  },

  getTeamLocations: async (gameId: string): Promise<TeamLocation[]> => {
    const { data } = await apiClient.get(`/games/${gameId}/monitoring/locations`);
    return data;
  },

  getProgress: async (gameId: string): Promise<TeamBaseProgress[]> => {
    const { data } = await apiClient.get(`/games/${gameId}/monitoring/progress`);
    return data;
  },

  getLeaderboard: async (
    gameId: string
  ): Promise<{ teamId: string; teamName: string; color: string; points: number; completedChallenges: number }[]> => {
    const { data } = await apiClient.get(`/games/${gameId}/monitoring/leaderboard`);
    return data;
  },

  getDashboardStats: async (
    gameId: string
  ): Promise<{
    totalTeams: number;
    totalBases: number;
    totalChallenges: number;
    pendingSubmissions: number;
    completedSubmissions: number;
    totalSubmissions: number;
    startDate: string;
    endDate: string;
  }> => {
    const { data } = await apiClient.get(`/games/${gameId}/monitoring/dashboard`);
    return data;
  },

  getResultsExport: async (
    gameId: string
  ): Promise<{
    gameName: string;
    challenges: { id: string; title: string; maxPoints: number }[];
    teams: { teamId: string; teamName: string; color: string; totalPoints: number; challengePoints: Record<string, number> }[];
  }> => {
    const { data } = await apiClient.get(`/games/${gameId}/monitoring/results-export`);
    return data;
  },

  /**
   * Realtime health stats for the operator dashboard widget.
   * P0 Track 2 Slice 5 — `GET /api/games/:gameId/realtime-stats`.
   */
  getRealtimeStats: async (gameId: string): Promise<RealtimeStats> => {
    const { data } = await apiClient.get(`/games/${gameId}/realtime-stats`);
    return data;
  },

  /**
   * Download the chronological activity audit export as a Blob.
   * Backend endpoint: {@code GET /games/:gameId/audit-export}. Returns
   * the raw body (JSON or CSV depending on `filters.format`) so the
   * caller can pipe it to a browser download via `URL.createObjectURL`.
   *
   * Only non-null, non-empty filter values are forwarded so the query
   * string stays minimal and the backend receives exactly what the
   * operator asked for.
   */
  exportAuditLog: async (
    gameId: string,
    filters: AuditExportFilters = {},
  ): Promise<Blob> => {
    const params = new URLSearchParams();
    (Object.entries(filters) as [keyof AuditExportFilters, unknown][]).forEach(
      ([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        params.append(key, String(value));
      },
    );
    const query = params.toString();
    const url = `/games/${gameId}/audit-export${query ? `?${query}` : ""}`;
    try {
      const { data } = await apiClient.get(url, { responseType: "blob" });
      return data;
    } catch (error) {
      // Axios keeps error bodies as Blob when responseType: "blob".
      // Re-hydrate into the shape getApiErrorMessage expects so callers
      // see the real server message instead of the generic fallback.
      const anyErr = error as { response?: { data?: unknown } };
      if (anyErr.response?.data instanceof Blob) {
        try {
          const text = await anyErr.response.data.text();
          anyErr.response.data = JSON.parse(text);
        } catch {
          // If the blob isn't JSON, leave it — caller falls back to generic message
        }
      }
      throw error;
    }
  },
};

export interface RealtimeStats {
  stompActiveSessions: number;
  mobileActiveSessions: number;
  totalActiveSessions: number;
  stompConnectsLastHour: number;
  mobileConnectsLastHour: number;
  stompDisconnectsLastHour: number;
  mobileDisconnectsLastHour: number;
  estimatedReconnectsLastHour: number;
  lastUpdated: string;
}
