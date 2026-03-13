import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useGameWebSocket } from "./useGameWebSocket";

// Mock the websocket module
const mockConnectWebSocket = vi.fn();
const mockDisconnectWebSocket = vi.fn();
vi.mock("@/lib/api/websocket", () => ({
  connectWebSocket: (...args: unknown[]) => mockConnectWebSocket(...args),
  disconnectWebSocket: (...args: unknown[]) => mockDisconnectWebSocket(...args),
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
});
