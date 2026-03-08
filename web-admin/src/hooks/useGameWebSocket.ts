import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { connectWebSocket, disconnectWebSocket } from "@/lib/api/websocket";

/**
 * Hook that connects to the game's WebSocket topic and invalidates
 * relevant React Query caches when real-time events arrive.
 * Use this in any monitoring page to get live updates.
 */
export function useGameWebSocket(gameId: string | undefined): string | null {
  const queryClient = useQueryClient();
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId) return;

    connectWebSocket(gameId, (payload) => {
      setConnectionError(null);

      const invalidate = (...keys: string[]) =>
        keys.forEach((k) => queryClient.invalidateQueries({ queryKey: [k, gameId] }));

      switch (payload.type) {
        case "activity":
          invalidate("activity", "submissions", "dashboard-stats", "leaderboard", "progress");
          break;
        case "submission_status":
          invalidate("submissions", "dashboard-stats", "leaderboard", "progress");
          break;
        case "notification":
          invalidate("notifications");
          break;
        case "game_status":
          invalidate("game", "dashboard-stats");
          queryClient.invalidateQueries({ queryKey: ["games"] });
          break;
        case "leaderboard":
          invalidate("leaderboard");
          break;
        case "location":
          invalidate("team-locations");
          break;
        default:
          invalidate("activity", "submissions", "dashboard-stats", "leaderboard", "progress");
      }
    }, (errorMessage) => {
      setConnectionError(errorMessage);
    });

    return () => {
      disconnectWebSocket();
    };
  }, [gameId, queryClient]);

  return connectionError;
}
