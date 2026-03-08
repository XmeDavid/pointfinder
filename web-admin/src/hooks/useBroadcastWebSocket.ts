import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";

const WS_URL = import.meta.env.VITE_WS_URL || "/ws";

export function useBroadcastWebSocket(
  gameId: string | undefined,
  code: string
): string | null {
  const queryClient = useQueryClient();
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId || !code) return;

    const client = new Client({
      webSocketFactory: () => new SockJS(WS_URL) as WebSocket,
      connectHeaders: { "X-Broadcast-Code": code.toUpperCase() },
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      onConnect: () => {
        setConnectionError(null);
        client.subscribe(`/topic/games/${gameId}`, (message) => {
          try {
            const payload = JSON.parse(message.body);
            switch (payload.type) {
              case "activity":
              case "submission_status":
                queryClient.invalidateQueries({
                  queryKey: ["broadcast-leaderboard", code],
                });
                queryClient.invalidateQueries({
                  queryKey: ["broadcast-progress", code],
                });
                break;
              case "location":
                queryClient.invalidateQueries({
                  queryKey: ["broadcast-locations", code],
                });
                break;
              case "leaderboard":
                queryClient.invalidateQueries({
                  queryKey: ["broadcast-leaderboard", code],
                });
                break;
              default:
                queryClient.invalidateQueries({
                  queryKey: ["broadcast-leaderboard", code],
                });
                queryClient.invalidateQueries({
                  queryKey: ["broadcast-progress", code],
                });
                queryClient.invalidateQueries({
                  queryKey: ["broadcast-locations", code],
                });
            }
          } catch (e) {
            console.error("Failed to parse broadcast WebSocket message:", e);
          }
        });
      },
      onStompError: (frame) => {
        const message =
          frame.headers["message"] || "Broadcast WebSocket connection error";
        console.error("STOMP error:", message);
        setConnectionError(message);
      },
      onWebSocketError: () => {
        setConnectionError("WebSocket transport error");
      },
    });

    client.activate();

    return () => {
      client.deactivate();
    };
  }, [gameId, code, queryClient]);

  return connectionError;
}
