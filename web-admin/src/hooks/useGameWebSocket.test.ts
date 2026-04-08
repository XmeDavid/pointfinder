import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useGameWebSocket } from "./useGameWebSocket";
import { useOperatorPresenceStore } from "./useOperatorPresence";
import { useAuthStore } from "./useAuth";

// Mock the websocket module
const mockConnectWebSocket = vi.fn();
const mockDisconnectWebSocket = vi.fn();
vi.mock("@/lib/api/websocket", () => ({
  connectWebSocket: (...args: unknown[]) => mockConnectWebSocket(...args),
  disconnectWebSocket: (...args: unknown[]) => mockDisconnectWebSocket(...args),
}));

// Mock the API client so `getValidAccessToken` is deterministic and we can
// assert the reconnect-time tokenProvider actually forces a refresh.
const mockGetValidAccessToken = vi.fn();
vi.mock("@/lib/api/client", () => ({
  getValidAccessToken: (...args: unknown[]) => mockGetValidAccessToken(...args),
}));

// Mock requestAnimationFrame to fire synchronously in tests
let rafCallbacks: Array<() => void> = [];
const originalRaf = globalThis.requestAnimationFrame;
const originalCaf = globalThis.cancelAnimationFrame;

describe("useGameWebSocket", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    rafCallbacks = [];
    let rafId = 0;
    globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb as unknown as () => void);
      return ++rafId;
    });
    globalThis.cancelAnimationFrame = vi.fn();

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCaf;
  });

  function wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }

  function flushRaf() {
    const cbs = [...rafCallbacks];
    rafCallbacks = [];
    cbs.forEach(cb => cb());
  }

  it("connects to WebSocket when gameId is provided", () => {
    renderHook(() => useGameWebSocket("game-1"), { wrapper });
    expect(mockConnectWebSocket).toHaveBeenCalledWith(
      "game-1",
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function)
    );
  });

  it("does not connect when gameId is undefined", () => {
    renderHook(() => useGameWebSocket(undefined), { wrapper });
    expect(mockConnectWebSocket).not.toHaveBeenCalled();
  });

  it("disconnects on unmount", () => {
    const { unmount } = renderHook(() => useGameWebSocket("game-1"), { wrapper });
    unmount();
    expect(mockDisconnectWebSocket).toHaveBeenCalled();
  });

  it("invalidates correct query keys on activity event", () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(() => useGameWebSocket("game-1"), { wrapper });

    // Extract the onMessage callback passed to connectWebSocket
    const onMessage = mockConnectWebSocket.mock.calls[0][1];

    act(() => {
      onMessage({ type: "activity", data: null });
      flushRaf();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["activity", "game-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["submissions", "game-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboard-stats", "game-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["leaderboard", "game-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["progress", "game-1"] });
  });

  it("invalidates correct keys on submission_status event", () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(() => useGameWebSocket("game-1"), { wrapper });

    const onMessage = mockConnectWebSocket.mock.calls[0][1];

    act(() => {
      onMessage({ type: "submission_status", data: null });
      flushRaf();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["submissions", "game-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["leaderboard", "game-1"] });
    // Should NOT invalidate activity
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ["activity", "game-1"] });
  });

  it("uses current gameId ref, not stale closure, when RAF fires", () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    // Render with game-1
    const { rerender } = renderHook(
      ({ gameId }) => useGameWebSocket(gameId),
      { wrapper, initialProps: { gameId: "game-1" as string | undefined } }
    );

    // Get the onMessage from the first connection
    const onMessage = mockConnectWebSocket.mock.calls[0][1];

    // Schedule an invalidation while game-1 is active (RAF not yet flushed)
    act(() => {
      onMessage({ type: "location", data: null });
    });

    // Now change gameId to game-2 BEFORE RAF fires
    act(() => {
      rerender({ gameId: "game-2" });
    });

    // Flush RAF - should use the CURRENT gameId (game-2), not the stale one (game-1)
    act(() => {
      flushRaf();
    });

    // The invalidation should target game-2, not game-1
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["team-locations", "game-2"] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ["team-locations", "game-1"] });
  });

  it("reports connection errors", () => {
    const { result } = renderHook(() => useGameWebSocket("game-1"), { wrapper });

    const onError = mockConnectWebSocket.mock.calls[0][2];

    act(() => {
      onError("Connection lost");
    });

    expect(result.current).toBe("Connection lost");
  });

  it("clears connection error on next message", () => {
    const { result } = renderHook(() => useGameWebSocket("game-1"), { wrapper });

    const onMessage = mockConnectWebSocket.mock.calls[0][1];
    const onError = mockConnectWebSocket.mock.calls[0][2];

    act(() => {
      onError("Connection lost");
    });
    expect(result.current).toBe("Connection lost");

    act(() => {
      onMessage({ type: "notification", data: null });
    });
    expect(result.current).toBeNull();
  });

  it("batches multiple invalidations into single RAF", () => {
    renderHook(() => useGameWebSocket("game-1"), { wrapper });
    const onMessage = mockConnectWebSocket.mock.calls[0][1];

    act(() => {
      onMessage({ type: "notification", data: null });
      onMessage({ type: "leaderboard", data: null });
    });

    // Only one RAF should have been scheduled
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    act(() => {
      flushRaf();
    });

    // Both keys should be invalidated in the single RAF flush
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["notifications", "game-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["leaderboard", "game-1"] });
  });

  it("cancels pending RAF on unmount", () => {
    const { unmount } = renderHook(() => useGameWebSocket("game-1"), { wrapper });
    const onMessage = mockConnectWebSocket.mock.calls[0][1];

    // Schedule a RAF
    act(() => {
      onMessage({ type: "activity", data: null });
    });

    unmount();
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
  });

  it("invalidates game query key on game_status event", () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(() => useGameWebSocket("game-1"), { wrapper });

    const onMessage = mockConnectWebSocket.mock.calls[0][1];

    act(() => {
      onMessage({ type: "game_status", data: { status: "live" } });
      flushRaf();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["game", "game-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboard-stats", "game-1"] });
    // game_status also invalidates the global games list (non-scoped)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["games"] });
  });

  it("updates presence store on presence event with operators", () => {
    renderHook(() => useGameWebSocket("game-1"), { wrapper });

    const onMessage = mockConnectWebSocket.mock.calls[0][1];
    const operators = [
      { id: "u1", name: "Alice", initials: "A" },
      { id: "u2", name: "Bob", initials: "B" },
    ];

    act(() => {
      onMessage({ type: "presence", data: { operators } });
    });

    // Presence events update the store directly rather than invalidating queries
    expect(useOperatorPresenceStore.getState().operators).toEqual(operators);
  });

  it("invalidates snapshot-supersede keys when WebSocket reconnects", () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(() => useGameWebSocket("game-1"), { wrapper });

    // The 4th arg passed to connectWebSocket is the onReconnect callback.
    const onReconnect = mockConnectWebSocket.mock.calls[0][3];
    expect(typeof onReconnect).toBe("function");

    act(() => {
      onReconnect();
    });

    // Reconnect should invalidate the full operator-dashboard supersede set
    // (same keys as `useVisibilityRefresh`).
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["game-snapshot", "game-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["game", "game-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["leaderboard", "game-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboard-stats", "game-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["submissions", "game-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["activity", "game-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["progress", "game-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["teams", "game-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["bases", "game-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["challenges", "game-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["assignments", "game-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["notifications", "game-1"] });
  });

  it("re-subscribes after disconnect and reconnect", () => {
    const { unmount } = renderHook(() => useGameWebSocket("game-1"), { wrapper });

    // First connection
    expect(mockConnectWebSocket).toHaveBeenCalledTimes(1);

    // Unmount disconnects
    unmount();
    expect(mockDisconnectWebSocket).toHaveBeenCalledTimes(1);

    // Re-render (simulating component remount) re-subscribes
    mockConnectWebSocket.mockClear();
    mockDisconnectWebSocket.mockClear();

    const { unmount: unmount2 } = renderHook(() => useGameWebSocket("game-1"), { wrapper });
    expect(mockConnectWebSocket).toHaveBeenCalledTimes(1);
    expect(mockConnectWebSocket).toHaveBeenCalledWith(
      "game-1",
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function)
    );

    unmount2();
    expect(mockDisconnectWebSocket).toHaveBeenCalledTimes(1);
  });

  describe("reconnect tokenProvider (P0 Track 2 Slice 4)", () => {
    beforeEach(() => {
      mockGetValidAccessToken.mockReset();
      useAuthStore.setState({
        user: { id: "u1", email: "op@test", name: "Op", role: "operator", createdAt: "" },
        accessToken: "stale-access-token",
        refreshToken: "refresh-token",
        isAuthenticated: true,
        hasHydrated: true,
      });
    });

    it("clears the cached access token and fetches a fresh one before reconnect", async () => {
      mockGetValidAccessToken.mockResolvedValue("fresh-access-token");
      renderHook(() => useGameWebSocket("game-1"), { wrapper });

      // The 5th arg is the reconnect-time tokenProvider
      const tokenProvider = mockConnectWebSocket.mock.calls[0][4] as () => Promise<string | null>;
      expect(typeof tokenProvider).toBe("function");

      // Pre-condition: store still holds the stale token from beforeEach
      expect(useAuthStore.getState().accessToken).toBe("stale-access-token");

      const token = await tokenProvider();

      // Must have asked the API client for a valid access token, which
      // under the hood issues POST /auth/refresh and rotates the store.
      expect(mockGetValidAccessToken).toHaveBeenCalledTimes(1);
      // Must have cleared the in-memory access token before refreshing so
      // getValidAccessToken() doesn't short-circuit to the cached stale value.
      // (The mocked getValidAccessToken doesn't actually write back to the
      // store — in production the refresh flow calls setTokens() — so we
      // verify the clear-before-refresh contract by asserting the store
      // no longer holds the stale token.)
      expect(useAuthStore.getState().accessToken).not.toBe("stale-access-token");
      expect(token).toBe("fresh-access-token");
    });

    it("returns null and swallows errors when refresh throws", async () => {
      mockGetValidAccessToken.mockRejectedValue(new Error("refresh endpoint down"));
      renderHook(() => useGameWebSocket("game-1"), { wrapper });

      const tokenProvider = mockConnectWebSocket.mock.calls[0][4] as () => Promise<string | null>;

      const token = await tokenProvider();

      expect(token).toBeNull();
      expect(mockGetValidAccessToken).toHaveBeenCalledTimes(1);
      // Cleared-then-refresh failed → stays null; onStompError path will
      // then trigger handleAuthFailure on the next STOMP frame.
      expect(useAuthStore.getState().accessToken).toBeNull();
    });

    it("returns null cleanly when refresh resolves to null", async () => {
      mockGetValidAccessToken.mockResolvedValue(null);
      renderHook(() => useGameWebSocket("game-1"), { wrapper });

      const tokenProvider = mockConnectWebSocket.mock.calls[0][4] as () => Promise<string | null>;

      const token = await tokenProvider();

      expect(token).toBeNull();
      expect(mockGetValidAccessToken).toHaveBeenCalledTimes(1);
    });
  });
});
