import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { getValidAccessToken } from "@/lib/api/client";
import { useAuthStore } from "@/hooks/useAuth";
import i18n from "@/i18n";

const WS_URL = import.meta.env.VITE_WS_URL || "/ws";

let stompClient: Client | null = null;

export function connectWebSocket(
  gameId: string,
  onMessage: (payload: { type: string; data: unknown }) => void,
  onError?: (message: string) => void
): Client {
  // Disconnect existing client if any
  if (stompClient) {
    stompClient.deactivate();
  }

  const client = new Client({
    webSocketFactory: () => new SockJS(WS_URL) as WebSocket,
    // connectHeaders are set dynamically in beforeConnect
    connectHeaders: {},
    beforeConnect: async () => {
      const token = await getValidAccessToken();
      if (token) {
        client.connectHeaders = { Authorization: `Bearer ${token}` };
      }
    },
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
      const raw = frame.headers["message"] || "WebSocket connection error";
      console.error("STOMP error:", raw);
      // Clear potentially expired token so next reconnect triggers a refresh
      useAuthStore.getState().clearAccessToken();
      onError?.(i18n.t("errors.liveUpdatesRetrying"));
    },
    onWebSocketError: () => {
      console.error("WebSocket transport error");
      onError?.(i18n.t("errors.liveUpdatesRetrying"));
    },
  });

  client.activate();
  stompClient = client;
  return client;
}

export function disconnectWebSocket(): void {
  if (stompClient) {
    stompClient.deactivate();
    stompClient = null;
  }
}
