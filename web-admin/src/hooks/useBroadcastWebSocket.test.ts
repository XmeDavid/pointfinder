import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useBroadcastWebSocket } from "./useBroadcastWebSocket";

// Mock @stomp/stompjs
const mockActivate = vi.fn();
const mockDeactivate = vi.fn();
const mockSubscribe = vi.fn();

let capturedOnConnect: (() => void) | undefined;
let capturedOnStompError: ((frame: { headers: Record<string, string> }) => void) | undefined;
let capturedOnWebSocketError: (() => void) | undefined;
let capturedConnectHeaders: Record<string, string> | undefined;

vi.mock("@stomp/stompjs", () => {
  class MockClient {
    activate: typeof mockActivate;
    deactivate: typeof mockDeactivate;
    subscribe: typeof mockSubscribe;

    constructor(config: Record<string, unknown>) {
      capturedOnConnect = config.onConnect as typeof capturedOnConnect;
      capturedOnStompError = config.onStompError as typeof capturedOnStompError;
      capturedOnWebSocketError = config.onWebSocketError as typeof capturedOnWebSocketError;
      capturedConnectHeaders = config.connectHeaders as typeof capturedConnectHeaders;
      this.activate = mockActivate;
      this.deactivate = mockDeactivate;
      this.subscribe = mockSubscribe;
    }
  }
  return { Client: MockClient };
});

vi.mock("sockjs-client", () => ({
  default: vi.fn(),
}));

vi.mock("@/i18n", () => ({
  default: {
    t: (key: string) => key,
  },
}));

// Mock requestAnimationFrame to fire synchronously in tests
let rafCallbacks: Array<() => void> = [];
const originalRaf = globalThis.requestAnimationFrame;
const originalCaf = globalThis.cancelAnimationFrame;

describe("useBroadcastWebSocket", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    rafCallbacks = [];
    capturedOnConnect = undefined;
    capturedOnStompError = undefined;
    capturedOnWebSocketError = undefined;
    capturedConnectHeaders = undefined;

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

  it("creates and activates STOMP client when gameId and code are provided", () => {
    renderHook(() => useBroadcastWebSocket("game-1", "ABC123"), { wrapper });
    expect(mockActivate).toHaveBeenCalledTimes(1);
  });

  it("does not activate when gameId is undefined", () => {
    renderHook(() => useBroadcastWebSocket(undefined, "ABC123"), { wrapper });
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it("does not activate when code is empty", () => {
    renderHook(() => useBroadcastWebSocket("game-1", ""), { wrapper });
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it("sends uppercase broadcast code in connect headers", () => {
    renderHook(() => useBroadcastWebSocket("game-1", "abc123"), { wrapper });
    expect(capturedConnectHeaders).toEqual({ "X-Broadcast-Code": "ABC123" });
  });

  it("subscribes to the correct game topic on connect", () => {
    renderHook(() => useBroadcastWebSocket("game-1", "ABC123"), { wrapper });

    act(() => {
      capturedOnConnect?.();
    });

    expect(mockSubscribe).toHaveBeenCalledWith(
      "/topic/games/game-1",
      expect.any(Function)
    );
  });

  it("invalidates broadcast-leaderboard and broadcast-progress on activity event", () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(() => useBroadcastWebSocket("game-1", "MYCODE"), { wrapper });

    act(() => {
      capturedOnConnect?.();
    });

    const messageHandler = mockSubscribe.mock.calls[0][1];

    act(() => {
      messageHandler({ body: JSON.stringify({ type: "activity", data: null }) });
      flushRaf();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["broadcast-leaderboard", "MYCODE"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["broadcast-progress", "MYCODE"] });
  });

  it("invalidates broadcast-leaderboard and broadcast-progress on submission_status event", () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(() => useBroadcastWebSocket("game-1", "MYCODE"), { wrapper });

    act(() => {
      capturedOnConnect?.();
    });

    const messageHandler = mockSubscribe.mock.calls[0][1];

    act(() => {
      messageHandler({ body: JSON.stringify({ type: "submission_status", data: null }) });
      flushRaf();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["broadcast-leaderboard", "MYCODE"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["broadcast-progress", "MYCODE"] });
    // Should NOT invalidate locations
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ["broadcast-locations", "MYCODE"] });
  });

  it("invalidates broadcast-locations on location event", () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(() => useBroadcastWebSocket("game-1", "MYCODE"), { wrapper });

    act(() => {
      capturedOnConnect?.();
    });

    const messageHandler = mockSubscribe.mock.calls[0][1];

    act(() => {
      messageHandler({ body: JSON.stringify({ type: "location", data: null }) });
      flushRaf();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["broadcast-locations", "MYCODE"] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ["broadcast-leaderboard", "MYCODE"] });
  });

  it("invalidates broadcast-leaderboard on leaderboard event", () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(() => useBroadcastWebSocket("game-1", "MYCODE"), { wrapper });

    act(() => {
      capturedOnConnect?.();
    });

    const messageHandler = mockSubscribe.mock.calls[0][1];

    act(() => {
      messageHandler({ body: JSON.stringify({ type: "leaderboard", data: null }) });
      flushRaf();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["broadcast-leaderboard", "MYCODE"] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ["broadcast-progress", "MYCODE"] });
  });

  it("invalidates all broadcast keys on unknown event type", () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(() => useBroadcastWebSocket("game-1", "MYCODE"), { wrapper });

    act(() => {
      capturedOnConnect?.();
    });

    const messageHandler = mockSubscribe.mock.calls[0][1];

    act(() => {
      messageHandler({ body: JSON.stringify({ type: "unknown_event", data: null }) });
      flushRaf();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["broadcast-leaderboard", "MYCODE"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["broadcast-progress", "MYCODE"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["broadcast-locations", "MYCODE"] });
  });

  it("batches multiple events into a single RAF", () => {
    renderHook(() => useBroadcastWebSocket("game-1", "MYCODE"), { wrapper });

    act(() => {
      capturedOnConnect?.();
    });

    const messageHandler = mockSubscribe.mock.calls[0][1];

    act(() => {
      messageHandler({ body: JSON.stringify({ type: "location", data: null }) });
      messageHandler({ body: JSON.stringify({ type: "leaderboard", data: null }) });
    });

    // Only one RAF should have been scheduled
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    act(() => {
      flushRaf();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["broadcast-locations", "MYCODE"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["broadcast-leaderboard", "MYCODE"] });
  });

  it("reports STOMP error as connection error", () => {
    const { result } = renderHook(() => useBroadcastWebSocket("game-1", "MYCODE"), { wrapper });

    act(() => {
      capturedOnStompError?.({ headers: { message: "Auth failed" } });
    });

    expect(result.current).toBe("Auth failed");
  });

  it("reports WebSocket transport error using i18n key", () => {
    const { result } = renderHook(() => useBroadcastWebSocket("game-1", "MYCODE"), { wrapper });

    act(() => {
      capturedOnWebSocketError?.();
    });

    expect(result.current).toBe("errors.liveUpdatesRetrying");
  });

  it("clears connection error on successful reconnect", () => {
    const { result } = renderHook(() => useBroadcastWebSocket("game-1", "MYCODE"), { wrapper });

    act(() => {
      capturedOnWebSocketError?.();
    });
    expect(result.current).toBe("errors.liveUpdatesRetrying");

    act(() => {
      capturedOnConnect?.();
    });
    expect(result.current).toBeNull();
  });

  it("deactivates client on unmount", () => {
    const { unmount } = renderHook(() => useBroadcastWebSocket("game-1", "MYCODE"), { wrapper });
    unmount();
    expect(mockDeactivate).toHaveBeenCalled();
  });

  it("cancels pending RAF on unmount", () => {
    const { unmount } = renderHook(() => useBroadcastWebSocket("game-1", "MYCODE"), { wrapper });

    act(() => {
      capturedOnConnect?.();
    });

    const messageHandler = mockSubscribe.mock.calls[0][1];

    // Schedule a RAF by sending a message
    act(() => {
      messageHandler({ body: JSON.stringify({ type: "activity", data: null }) });
    });

    unmount();
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
  });

  it("handles malformed JSON gracefully without crashing", () => {
    renderHook(() => useBroadcastWebSocket("game-1", "MYCODE"), { wrapper });

    act(() => {
      capturedOnConnect?.();
    });

    const messageHandler = mockSubscribe.mock.calls[0][1];

    // Should not throw
    expect(() => {
      act(() => {
        messageHandler({ body: "not valid json{{{" });
      });
    }).not.toThrow();
  });

  it("falls back to i18n error when STOMP error has no message header", () => {
    const { result } = renderHook(() => useBroadcastWebSocket("game-1", "MYCODE"), { wrapper });

    act(() => {
      capturedOnStompError?.({ headers: {} });
    });

    expect(result.current).toBe("errors.liveUpdatesRetrying");
  });

  it("returns null when no error has occurred", () => {
    const { result } = renderHook(() => useBroadcastWebSocket("game-1", "MYCODE"), { wrapper });
    expect(result.current).toBeNull();
  });
});
