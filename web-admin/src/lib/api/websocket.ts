import { Client } from "@stomp/stompjs";
import { getValidAccessToken } from "@/lib/api/client";
import { useAuthStore } from "@/hooks/useAuth";
import i18n from "@/i18n";

const WS_PATH = import.meta.env.VITE_WS_URL || "/ws-native";

function getBrokerURL(): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}${WS_PATH}`;
}

let stompClient: Client | null = null;

export function connectWebSocket(
  gameId: string,
  onMessage: (payload: { type: string; data: unknown }) => void,
  onError?: (message: string) => void,
  onReconnect?: () => void,
  /**
   * Optional refresh hook invoked before every reconnect attempt (i.e. every
   * `beforeConnect` call after the first successful `onConnect`). Should
   * return a freshly minted operator access token, or `null` if the refresh
   * token is also expired / unavailable. On `null`, the STOMP client falls
   * back to the standard `getValidAccessToken()` path, which in turn
   * surfaces auth failure via `onStompError` → `handleAuthFailure`.
   *
   * This covers the P0 Track 2 Slice 4 gap: operator access tokens are
   * 15 minutes; without refresh-on-reconnect, an idle operator whose tab
   * is backgrounded past expiry would reconnect with a stale JWT, hit an
   * auth failure on every STOMP frame, and see no live updates until they
   * manually reloaded. Mirrors the iOS `tokenProvider` pattern in
   * `MobileRealtimeClient.swift`.
   */
  tokenProvider?: () => Promise<string | null>
): Client {
  // Disconnect existing client if any
  if (stompClient) {
    stompClient.deactivate();
  }

  // Track whether we've already seen a successful onConnect for this client.
  // STOMP.js calls onConnect both on the first connection and on every
  // subsequent reconnect, so we need to distinguish the two ourselves.
  // Only a *re*-connect should trigger snapshot refresh — the first connect
  // happens at mount time, when React Query has already fetched fresh data.
  let hasConnectedOnce = false;

  const client = new Client({
    brokerURL: getBrokerURL(),
    // connectHeaders are set dynamically in beforeConnect
    connectHeaders: {},
    beforeConnect: async () => {
      // On reconnect (second-and-subsequent beforeConnect), force a token
      // refresh so the new socket carries a fresh JWT. On the first connect
      // we defer to `getValidAccessToken()` which happily returns whatever's
      // already in memory (React Query has just fetched with that token, so
      // it's guaranteed to be live).
      let token: string | null = null;
      if (hasConnectedOnce && tokenProvider) {
        try {
          token = await tokenProvider();
        } catch (err) {
          console.warn("WebSocket tokenProvider threw; falling back to cached token", err);
          token = null;
        }
      }
      if (!token) {
        token = await getValidAccessToken();
      }
      if (token) {
        client.connectHeaders = { Authorization: `Bearer ${token}` };
      } else {
        // Strip any stale header so the STOMP frame is sent without auth —
        // the backend will reject with a STOMP ERROR frame and our
        // onStompError handler will clear auth / trigger logout.
        client.connectHeaders = {};
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

      // Fire the reconnect hook on every connect *after* the first. This is
      // the web-admin equivalent of iOS `MobileRealtimeClient.onReconnect`
      // and Android's `ON_RESUME` wiring — the canonical recovery pattern
      // from docs/realtime-and-mobile.md §7 "State Snapshot Contract".
      if (hasConnectedOnce) {
        try {
          onReconnect?.();
        } catch (e) {
          console.error("onReconnect callback failed:", e);
        }
      } else {
        hasConnectedOnce = true;
      }
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
