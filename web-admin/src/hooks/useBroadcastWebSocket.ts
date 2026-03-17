import { useEffect, useRef, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import i18n from "@/i18n";

const WS_URL = import.meta.env.VITE_WS_URL || "/ws";

export function useBroadcastWebSocket(
  gameId: string | undefined,
  code: string
): string | null {
  const queryClient = useQueryClient();
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const pendingKeys = useRef<Set<string>>(new Set());
  const rafRef = useRef<number | null>(null);

  const scheduleInvalidate = useCallback((...keys: string[]) => {
    keys.forEach(k => pendingKeys.current.add(k));
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      pendingKeys.current.forEach(k =>
        queryClient.invalidateQueries({ queryKey: [k, code] })
      );
      pendingKeys.current.clear();
      rafRef.current = null;
    });
  }, [queryClient, code]);

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
                scheduleInvalidate("broadcast-leaderboard", "broadcast-progress");
                break;
              case "location":
                scheduleInvalidate("broadcast-locations");
                break;
              case "leaderboard":
                scheduleInvalidate("broadcast-leaderboard");
                break;
              default:
                scheduleInvalidate("broadcast-leaderboard", "broadcast-progress", "broadcast-locations");
            }
          } catch (e) {
            console.error("Failed to parse broadcast WebSocket message:", e);
          }
        });
      },
      onStompError: (frame) => {
        const message = frame.headers["message"] || i18n.t("errors.liveUpdatesRetrying");
        console.error("STOMP error:", message);
        setConnectionError(message);
      },
      onWebSocketError: () => {
        setConnectionError(i18n.t("errors.liveUpdatesRetrying"));
      },
    });

    client.activate();

    return () => {
      client.deactivate();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [gameId, code, queryClient, scheduleInvalidate]);

  return connectionError;
}
