import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { gamesApi } from "@/lib/api/games";
import type { OperatorSnapshotResponse } from "@/types";

/**
 * Query keys that the operator snapshot endpoint logically supersedes.
 *
 * Whenever we refresh from a snapshot — whether because the tab regained
 * focus or because the WebSocket reconnected — we invalidate this exact set
 * so every operator dashboard widget re-reads from the server. Keep this
 * list in sync with the query keys the snapshot response actually covers
 * (game metadata, leaderboard, dashboard stats, submissions, teams,
 * monitoring activity/progress, upload observability, notifications).
 *
 * The snapshot key itself is invalidated too so `useGameSnapshot` consumers
 * see fresh `dataUpdatedAt` on refresh.
 *
 * Intentionally NOT included:
 *   - `team-locations` — location updates arrive every 30s on their own
 *     realtime channel and do not bump `games.state_version`. See
 *     docs/realtime-and-mobile.md §7.
 *
 * See docs/realtime-and-mobile.md §7 "State Snapshot Contract".
 */
const SNAPSHOT_SUPERSEDE_KEYS = [
  "game-snapshot",
  "game",
  "leaderboard",
  "dashboard-stats",
  "submissions",
  "activity",
  "progress",
  "teams",
  "bases",
  "challenges",
  "assignments",
  "notifications",
] as const;

/**
 * Invalidate every React Query key that the operator snapshot logically
 * supersedes for a given game. Shared by the visibility refresh hook and
 * the WebSocket reconnect callback so both paths produce the same effect.
 */
export function invalidateSnapshotSupersededQueries(
  queryClient: QueryClient,
  gameId: string,
): void {
  for (const key of SNAPSHOT_SUPERSEDE_KEYS) {
    queryClient.invalidateQueries({ queryKey: [key, gameId] });
  }
}

/**
 * Canonical "give me the current state of this game" query. Matches the
 * recovery pattern documented in docs/realtime-and-mobile.md §7.
 *
 * Operators reach for this whenever they suspect cached state drifted
 * (tab re-focus, WebSocket reconnect, any missed realtime event). The
 * returned `dataUpdatedAt` is suitable for a "last updated X ago"
 * affordance.
 */
export function useGameSnapshot(gameId: string | undefined) {
  return useQuery<OperatorSnapshotResponse>({
    queryKey: ["game-snapshot", gameId],
    queryFn: () => gamesApi.getSnapshot(gameId!),
    enabled: !!gameId,
    staleTime: 1000 * 30,
  });
}

/**
 * Re-fetches the canonical operator snapshot whenever the browser tab
 * regains focus.
 *
 * Today's web admin sets React Query `staleTime` to 30s, but `staleTime`
 * only affects the freshness check on the *next* access — it does not
 * auto-refetch backgrounded tabs. A tab that sits behind another window
 * for 30 minutes silently drifts from reality, and the only thing that
 * rescues it is the next inbound broadcast (which may never come if the
 * WebSocket dropped while backgrounded).
 *
 * The fix: on `document.visibilitychange → visible`, invalidate the
 * operator-dashboard query keys the snapshot supersedes. React Query then
 * refetches each one lazily as the UI reads it. This is the web-admin
 * counterpart to iOS `scenePhase == .active` and Android `ON_RESUME`
 * wiring from Slice 2.
 *
 * The hook is a no-op when `gameId` is undefined so it is safe to mount
 * unconditionally from a parent layout. Cleans up its own listener on
 * unmount and on `gameId` change.
 */
export function useVisibilityRefresh(gameId: string | undefined): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!gameId) return;
    if (typeof document === "undefined") return;

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      console.info(
        `[snapshot] Tab visible — refreshing operator dashboard for game ${gameId}`,
      );
      invalidateSnapshotSupersededQueries(queryClient, gameId);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [gameId, queryClient]);
}
