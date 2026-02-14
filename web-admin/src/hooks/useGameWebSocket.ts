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
      switch (payload.type) {
        case "activity":
          queryClient.invalidateQueries({ queryKey: ["activity", gameId] });
          queryClient.invalidateQueries({ queryKey: ["submissions", gameId] });
          queryClient.invalidateQueries({ queryKey: ["dashboard-stats", gameId] });
          queryClient.invalidateQueries({ queryKey: ["leaderboard", gameId] });
          queryClient.invalidateQueries({ queryKey: ["progress", gameId] });
          break;
        case "submission_status":
          queryClient.invalidateQueries({ queryKey: ["submissions", gameId] });
          queryClient.invalidateQueries({ queryKey: ["dashboard-stats", gameId] });
          queryClient.invalidateQueries({ queryKey: ["leaderboard", gameId] });
          queryClient.invalidateQueries({ queryKey: ["progress", gameId] });
          break;
        case "notification":
          queryClient.invalidateQueries({ queryKey: ["notifications", gameId] });
          break;
        case "game_status":
          queryClient.invalidateQueries({ queryKey: ["game", gameId] });
          queryClient.invalidateQueries({ queryKey: ["games"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard-stats", gameId] });
          break;
        case "leaderboard":
          queryClient.invalidateQueries({ queryKey: ["leaderboard", gameId] });
          break;
        case "location":
          queryClient.invalidateQueries({ queryKey: ["team-locations", gameId] });
          break;
        default:
          // Invalidate everything for unknown event types
          queryClient.invalidateQueries({ queryKey: ["activity", gameId] });
          queryClient.invalidateQueries({ queryKey: ["submissions", gameId] });
          queryClient.invalidateQueries({ queryKey: ["dashboard-stats", gameId] });
          queryClient.invalidateQueries({ queryKey: ["leaderboard", gameId] });
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
