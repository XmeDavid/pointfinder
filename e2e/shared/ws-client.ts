import { Client, IFrame, IMessage } from '@stomp/stompjs';
import WebSocket from 'ws';
import { config } from './config';

export interface BroadcastEnvelope {
  version: number;
  type: string;
  gameId: string;
  emittedAt: string;
  data: unknown;
}

interface WsClientOptions {
  token?: string;
  broadcastCode?: string;
}

/**
 * Connect to the STOMP broker at /ws/websocket and subscribe to
 * /topic/games/{gameId}.  Returns helpers to wait for specific
 * broadcast types and to disconnect cleanly.
 */
export async function connectToGameTopic(
  gameId: string,
  opts: WsClientOptions,
): Promise<{
  waitForBroadcast: (type: string, timeout?: number) => Promise<BroadcastEnvelope>;
  messages: BroadcastEnvelope[];
  disconnect: () => Promise<void>;
}> {
  const wsUrl = config.baseUrl.replace(/^https/, 'wss').replace(/^http/, 'ws') + '/ws/websocket';

  const connectHeaders: Record<string, string> = {};
  if (opts.token) {
    connectHeaders['Authorization'] = `Bearer ${opts.token}`;
  } else if (opts.broadcastCode) {
    connectHeaders['X-Broadcast-Code'] = opts.broadcastCode;
  }

  const messages: BroadcastEnvelope[] = [];
  const waiters: Array<{ type: string; resolve: (msg: BroadcastEnvelope) => void; reject?: (err: Error) => void }> = [];

  return new Promise<{
    waitForBroadcast: (type: string, timeout?: number) => Promise<BroadcastEnvelope>;
    messages: BroadcastEnvelope[];
    disconnect: () => Promise<void>;
  }>((resolve, reject) => {
    const client = new Client({
      webSocketFactory: () => new WebSocket(wsUrl, { rejectUnauthorized: false }) as unknown as globalThis.WebSocket,
      connectHeaders,
      reconnectDelay: 0, // no auto-reconnect in tests
      debug: () => {},
    });

    client.onConnect = () => {
      client.subscribe(`/topic/games/${gameId}`, (message: IMessage) => {
        try {
          const envelope: BroadcastEnvelope = JSON.parse(message.body);
          messages.push(envelope);

          // Resolve any pending waiters that match
          for (let i = waiters.length - 1; i >= 0; i--) {
            if (waiters[i].type === envelope.type) {
              waiters[i].resolve(envelope);
              waiters.splice(i, 1);
            }
          }
        } catch {
          // ignore malformed messages
        }
      });

      resolve({
        messages,

        waitForBroadcast(type: string, timeout = 15_000): Promise<BroadcastEnvelope> {
          // Check if already received
          const existing = messages.find((m) => m.type === type);
          if (existing) return Promise.resolve(existing);

          return new Promise<BroadcastEnvelope>((res, rej) => {
            let timer: ReturnType<typeof setTimeout>;
            const waiter = {
              type,
              resolve: (msg: BroadcastEnvelope) => {
                clearTimeout(timer);
                res(msg);
              },
              reject: (err: Error) => {
                clearTimeout(timer);
                rej(err);
              },
            };
            timer = setTimeout(() => {
              const idx = waiters.indexOf(waiter);
              if (idx >= 0) waiters.splice(idx, 1);
              rej(new Error(`Timed out waiting for broadcast type "${type}" after ${timeout}ms`));
            }, timeout);
            waiters.push(waiter);
          });
        },

        async disconnect() {
          for (const w of waiters) {
            w.reject?.(new Error('WebSocket disconnected'));
          }
          waiters.length = 0;
          if (client.connected) {
            client.deactivate();
          }
        },
      });
    };

    client.onStompError = (frame: IFrame) => {
      reject(new Error(`STOMP error: ${frame.headers['message'] ?? frame.body}`));
    };

    client.onWebSocketError = (event: Event) => {
      reject(new Error(`WebSocket error connecting to ${wsUrl}`));
    };

    client.activate();
  });
}
