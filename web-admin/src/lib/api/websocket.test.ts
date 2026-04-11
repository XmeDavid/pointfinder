import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Verifies the P0 Track 2 Slice 4 contract at the `connectWebSocket`
 * level: the STOMP client asks `tokenProvider` for a fresh JWT *only*
 * before reconnect attempts, never before the initial connect. On first
 * connect the standard `getValidAccessToken()` path is used because
 * React Query has already fetched with whatever's in memory and we want
 * to avoid piling an extra refresh call onto the mount path.
 *
 * We mock `@stomp/stompjs` so tests run without a broker; the mock
 * records `beforeConnect` and exposes a helper to simulate successive
 * `onConnect` events (first connect → reconnect → reconnect).
 */

type BeforeConnectFn = () => Promise<void>;
type OnConnectFn = () => void;

interface MockClientOptions {
  brokerURL: string;
  connectHeaders: Record<string, string>;
  beforeConnect?: BeforeConnectFn;
  onConnect?: OnConnectFn;
  onStompError?: (frame: { headers: Record<string, string> }) => void;
  onWebSocketError?: () => void;
  reconnectDelay?: number;
  heartbeatIncoming?: number;
  heartbeatOutgoing?: number;
}

class MockClient {
  public connectHeaders: Record<string, string>;
  public brokerURL: string;
  public readonly options: MockClientOptions;
  public activated = false;
  public deactivated = false;
  public subscribed: Array<{ destination: string; handler: (msg: { body: string }) => void }> = [];

  constructor(opts: MockClientOptions) {
    this.options = opts;
    this.brokerURL = opts.brokerURL;
    this.connectHeaders = opts.connectHeaders ?? {};
  }

  activate() {
    this.activated = true;
  }

  async deactivate() {
    this.deactivated = true;
  }

  subscribe(destination: string, handler: (msg: { body: string }) => void) {
    this.subscribed.push({ destination, handler });
    return { unsubscribe: () => {} };
  }

  /** Test helper: simulate a successful STOMP CONNECT. */
  async fireConnect() {
    if (this.options.beforeConnect) await this.options.beforeConnect();
    this.options.onConnect?.();
  }
}

vi.mock("@stomp/stompjs", () => ({
  Client: MockClient,
}));

const mockGetValidAccessToken = vi.fn();
vi.mock("@/lib/api/client", () => ({
  getValidAccessToken: (...args: unknown[]) => mockGetValidAccessToken(...args),
}));

const mockClearAccessToken = vi.fn();
const mockHandleAuthFailure = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuthStore: {
    getState: () => ({
      clearAccessToken: mockClearAccessToken,
      handleAuthFailure: mockHandleAuthFailure,
    }),
  },
}));

vi.mock("@/i18n", () => ({
  default: { t: (key: string) => key },
}));

// window is provided by the vitest jsdom env; assert we can build a URL.
describe("connectWebSocket reconnect tokenProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetValidAccessToken.mockReset();
  });

  async function importFresh() {
    // Re-import after each test so module-level `stompClient` state doesn't
    // bleed across tests.
    vi.resetModules();
    return await import("./websocket");
  }

  it("does not invoke tokenProvider on the first connect", async () => {
    mockGetValidAccessToken.mockResolvedValue("initial-token");
    const tokenProvider = vi.fn(async () => "refreshed-token");

    const { connectWebSocket } = await importFresh();
    const client = connectWebSocket(
      "game-1",
      () => {},
      () => {},
      () => {},
      tokenProvider
    ) as unknown as MockClient;

    await client.fireConnect();

    expect(tokenProvider).not.toHaveBeenCalled();
    expect(mockGetValidAccessToken).toHaveBeenCalledTimes(1);
    expect(client.connectHeaders).toEqual({ Authorization: "Bearer initial-token" });
  });

  it("invokes tokenProvider on every subsequent reconnect", async () => {
    mockGetValidAccessToken.mockResolvedValue("initial-token");
    const tokenProvider = vi.fn()
      .mockResolvedValueOnce("refreshed-1")
      .mockResolvedValueOnce("refreshed-2");

    const { connectWebSocket } = await importFresh();
    const client = connectWebSocket(
      "game-1",
      () => {},
      () => {},
      () => {},
      tokenProvider
    ) as unknown as MockClient;

    // 1. Initial connect — uses getValidAccessToken, not tokenProvider.
    await client.fireConnect();
    expect(tokenProvider).toHaveBeenCalledTimes(0);
    expect(client.connectHeaders).toEqual({ Authorization: "Bearer initial-token" });

    // 2. First reconnect — must call tokenProvider, and the refreshed
    //    token must end up on connectHeaders.
    await client.fireConnect();
    expect(tokenProvider).toHaveBeenCalledTimes(1);
    expect(client.connectHeaders).toEqual({ Authorization: "Bearer refreshed-1" });

    // 3. Second reconnect — tokenProvider called again, new value used.
    await client.fireConnect();
    expect(tokenProvider).toHaveBeenCalledTimes(2);
    expect(client.connectHeaders).toEqual({ Authorization: "Bearer refreshed-2" });
  });

  it("falls back to getValidAccessToken when tokenProvider returns null on reconnect", async () => {
    mockGetValidAccessToken
      .mockResolvedValueOnce("initial-token") // first connect
      .mockResolvedValueOnce("fallback-token"); // reconnect fallback
    const tokenProvider = vi.fn(async () => null);

    const { connectWebSocket } = await importFresh();
    const client = connectWebSocket(
      "game-1",
      () => {},
      () => {},
      () => {},
      tokenProvider
    ) as unknown as MockClient;

    await client.fireConnect(); // initial
    await client.fireConnect(); // reconnect

    expect(tokenProvider).toHaveBeenCalledTimes(1);
    expect(mockGetValidAccessToken).toHaveBeenCalledTimes(2);
    expect(client.connectHeaders).toEqual({ Authorization: "Bearer fallback-token" });
  });

  it("strips the Authorization header when both tokenProvider and fallback return null", async () => {
    mockGetValidAccessToken
      .mockResolvedValueOnce("initial-token")
      .mockResolvedValueOnce(null);
    const tokenProvider = vi.fn(async () => null);

    const { connectWebSocket } = await importFresh();
    const client = connectWebSocket(
      "game-1",
      () => {},
      () => {},
      () => {},
      tokenProvider
    ) as unknown as MockClient;

    await client.fireConnect();
    await client.fireConnect();

    // Fully expired session: no Authorization header → STOMP CONNECT will
    // be rejected → onStompError fires → handleAuthFailure.
    expect(client.connectHeaders).toEqual({});
  });

  it("catches thrown tokenProvider and falls back to getValidAccessToken", async () => {
    mockGetValidAccessToken
      .mockResolvedValueOnce("initial-token")
      .mockResolvedValueOnce("fallback-after-throw");
    const tokenProvider = vi.fn(async () => {
      throw new Error("refresh endpoint down");
    });

    const { connectWebSocket } = await importFresh();
    const client = connectWebSocket(
      "game-1",
      () => {},
      () => {},
      () => {},
      tokenProvider
    ) as unknown as MockClient;

    await client.fireConnect(); // initial
    await client.fireConnect(); // reconnect — tokenProvider throws

    expect(tokenProvider).toHaveBeenCalledTimes(1);
    expect(client.connectHeaders).toEqual({ Authorization: "Bearer fallback-after-throw" });
  });

  it("works without a tokenProvider (backwards compatible)", async () => {
    mockGetValidAccessToken.mockResolvedValue("only-token");

    const { connectWebSocket } = await importFresh();
    const client = connectWebSocket(
      "game-1",
      () => {},
      () => {},
      () => {}
      // no tokenProvider passed
    ) as unknown as MockClient;

    await client.fireConnect();
    await client.fireConnect();

    // Every beforeConnect falls back to getValidAccessToken when no
    // tokenProvider is supplied — matches pre-Slice 4 behaviour exactly.
    expect(mockGetValidAccessToken).toHaveBeenCalledTimes(2);
    expect(client.connectHeaders).toEqual({ Authorization: "Bearer only-token" });
  });
});

describe("onStompError WS_ACCESS_DENIED handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetValidAccessToken.mockReset();
    mockHandleAuthFailure.mockReset();
  });

  async function importFresh() {
    vi.resetModules();
    return await import("./websocket");
  }

  it("triggers handleAuthFailure and deactivates when refresh fails on WS_ACCESS_DENIED", async () => {
    mockGetValidAccessToken.mockResolvedValueOnce("initial-token");
    const onError = vi.fn();

    const { connectWebSocket } = await importFresh();
    const client = connectWebSocket(
      "game-1",
      () => {},
      onError,
      () => {}
    ) as unknown as MockClient;

    await client.fireConnect();

    // Simulate WS_ACCESS_DENIED — should only clear access token, not logout.
    // The HTTP layer (client.ts) is the single authority on auth state.
    // STOMP auto-reconnect will pick up a fresh token via beforeConnect.
    client.options.onStompError!({
      headers: { message: "Auth failed", "error-code": "WS_ACCESS_DENIED" },
    });

    expect(mockClearAccessToken).toHaveBeenCalledTimes(1);
    expect(mockHandleAuthFailure).not.toHaveBeenCalled();
    expect(client.deactivated).toBe(false);
    expect(onError).toHaveBeenCalled();
  });

  it("clears access token on non-auth STOMP errors without triggering logout", async () => {
    mockGetValidAccessToken.mockResolvedValueOnce("initial-token");

    const { connectWebSocket } = await importFresh();
    const client = connectWebSocket(
      "game-1",
      () => {},
      () => {},
      () => {}
    ) as unknown as MockClient;

    await client.fireConnect();

    // Simulate a non-auth STOMP error (e.g. broker restart)
    client.options.onStompError!({
      headers: { message: "Broker unavailable" },
    });

    expect(mockClearAccessToken).toHaveBeenCalledTimes(1);
    expect(mockHandleAuthFailure).not.toHaveBeenCalled();
    expect(client.deactivated).toBe(false);
  });
});
