import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";

const WS_URL = import.meta.env.VITE_WS_URL || "http://localhost:8080/ws";

let stompClient: Client | null = null;

export function connectWebSocket(
  gameId: string,
  onMessage: (payload: { type: string; data: unknown }) => void
): Client {
  // Disconnect existing client if any
  if (stompClient?.active) {
    stompClient.deactivate();
  }

  const client = new Client({
    webSocketFactory: () => new SockJS(WS_URL) as WebSocket,
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
      console.error("STOMP error:", frame.headers["message"]);
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
