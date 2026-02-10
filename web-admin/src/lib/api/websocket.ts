import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { useAuthStore } from "@/hooks/useAuth";

const WS_URL = import.meta.env.VITE_WS_URL || "/ws";

let stompClient: Client | null = null;

export function connectWebSocket(
  gameId: string,
  onMessage: (payload: { type: string; data: unknown }) => void,
  onError?: (message: string) => void
): Client {
  // Disconnect existing client if any
  if (stompClient?.active) {
    stompClient.deactivate();
  }

  const accessToken = useAuthStore.getState().accessToken;

  const client = new Client({
    webSocketFactory: () => new SockJS(WS_URL) as WebSocket,
    connectHeaders: accessToken
      ? {
          Authorization: `Bearer ${accessToken}`,
        }
      : {},
    reconnectDelay: 5000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    onConnect: () => {
      client.subscribe(`/topic/games/${gameId}`, (message) => {
        try {
          const payload = JSON.parse(message.body);
          onMessage(payload);
        } catch (e) {
          console.error("Failed to parse WebSocket message:", e);
        }
      });
    },
    onStompError: (frame) => {
      const message = frame.headers["message"] || "WebSocket connection error";
      console.error("STOMP error:", message);
      onError?.(message);
    },
    onWebSocketError: () => {
      const message = "WebSocket transport error";
      console.error(message);
      onError?.(message);
    },
  });

  client.activate();
  stompClient = client;
  return client;
}

export function disconnectWebSocket(): void {
  if (stompClient?.active) {
    stompClient.deactivate();
    stompClient = null;
  }
}
