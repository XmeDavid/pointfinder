import { useEffect, useRef, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { connectWebSocket, disconnectWebSocket } from "@/lib/api/websocket";
import { useOperatorPresenceStore, type OperatorPresence } from "./useOperatorPresence";

/**
 * Hook that connects to the game's WebSocket topic and invalidates
 * relevant React Query caches when real-time events arrive.
 * Use this in any monitoring page to get live updates.
 */
export function useGameWebSocket(gameId: string | undefined): string | null {
  const queryClient = useQueryClient();
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const pendingKeys = useRef<Set<string>>(new Set());
  const rafRef = useRef<number | null>(null);
  const gameIdRef = useRef<string | undefined>(gameId);

  // Keep the ref in sync so the RAF callback always uses the current gameId
  useEffect(() => {
    gameIdRef.current = gameId;
  }, [gameId]);

  const scheduleInvalidate = useCallback((...keys: string[]) => {
    keys.forEach(k => pendingKeys.current.add(k));
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      const currentGameId = gameIdRef.current;
      pendingKeys.current.forEach(k =>
        queryClient.invalidateQueries({ queryKey: [k, currentGameId] })
      );
      pendingKeys.current.clear();
      rafRef.current = null;
    });
  }, [queryClient]);

  useEffect(() => {
    if (!gameId) return;

    connectWebSocket(gameId, (payload) => {
      setConnectionError(null);

      const setOperators = useOperatorPresenceStore.getState().setOperators;

      switch (payload.type) {
        case "activity":
          scheduleInvalidate("activity", "submissions", "dashboard-stats", "leaderboard", "progress");
          break;
        case "submission_status":
          scheduleInvalidate("submissions", "dashboard-stats", "leaderboard", "progress");
          break;
        case "notification":
          scheduleInvalidate("notifications");
          break;
        case "game_status":
          scheduleInvalidate("game", "dashboard-stats");
          queryClient.invalidateQueries({ queryKey: ["games"] });
          break;
        case "leaderboard":
          scheduleInvalidate("leaderboard");
          break;
        case "location":
          scheduleInvalidate("team-locations");
          break;
        case "presence": {
          const presenceData = payload.data as { operators?: OperatorPresence[] } | null;
          if (presenceData?.operators) {
            setOperators(presenceData.operators);
          }
          break;
        }
        default:
          scheduleInvalidate("activity", "submissions", "dashboard-stats", "leaderboard", "progress");
      }
    }, (errorMessage) => {
      setConnectionError(errorMessage);
    });

    return () => {
      disconnectWebSocket();
      useOperatorPresenceStore.getState().clear();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [gameId, queryClient, scheduleInvalidate]);

  return connectionError;
}
