import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

// Mock gamesApi before importing the hook under test
vi.mock("@/lib/api/games", () => ({
  gamesApi: {
    getSnapshot: vi.fn(),
  },
}));

import { gamesApi } from "@/lib/api/games";
import {
  useGameSnapshot,
  useVisibilityRefresh,
  invalidateSnapshotSupersededQueries,
} from "./useGameSnapshot";
import type { OperatorSnapshotResponse } from "@/types";

function buildSnapshot(overrides: Partial<OperatorSnapshotResponse> = {}): OperatorSnapshotResponse {
  return {
    stateVersion: 42,
    serverTime: "2026-04-08T14:23:05.817Z",
    game: {
      id: "game-1",
      name: "Test Game",
      description: "desc",
      status: "live",
      unlockTrigger: "CHECK_IN",
      tileSource: "osm",
      startDate: null,
      endDate: null,
      uniformAssignment: false,
      broadcastEnabled: false,
      broadcastCode: null,
    },
    teams: [],
    leaderboard: [],
    pendingReviews: 3,
    activeUploads: 1,
    needsAttention: 0,
    ...overrides,
  };
}

describe("useGameSnapshot", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  function wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }

  it("returns parsed snapshot data on success", async () => {
    const snapshot = buildSnapshot({ pendingReviews: 7 });
    (gamesApi.getSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(snapshot);

    const { result } = renderHook(() => useGameSnapshot("game-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(snapshot);
    expect(gamesApi.getSnapshot).toHaveBeenCalledWith("game-1");
  });

  it("does not fetch when gameId is undefined", () => {
    renderHook(() => useGameSnapshot(undefined), { wrapper });
    expect(gamesApi.getSnapshot).not.toHaveBeenCalled();
  });

  it("uses the expected query key so invalidation hits it", async () => {
    const snapshot = buildSnapshot();
    (gamesApi.getSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(snapshot);

    const { result } = renderHook(() => useGameSnapshot("game-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // The snapshot key should live under ["game-snapshot", gameId]
    const state = queryClient.getQueryState(["game-snapshot", "game-1"]);
    expect(state).toBeDefined();
    expect(state?.data).toEqual(snapshot);
  });
});

describe("invalidateSnapshotSupersededQueries", () => {
  it("invalidates every snapshot-superseded query key for the given gameId", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");

    invalidateSnapshotSupersededQueries(qc, "game-xyz");

    const expectedKeys = [
      "game-snapshot",
      "game",
      "leaderboard",
      "dashboard-stats",
      "submissions",
      "activity",
      "progress",
      "teams",
      "bases",
      "challenges",
      "assignments",
      "notifications",
    ];
    expectedKeys.forEach((key) => {
      expect(spy).toHaveBeenCalledWith({ queryKey: [key, "game-xyz"] });
    });
  });
});

describe("useVisibilityRefresh", () => {
  let queryClient: QueryClient;
  let originalVisibilityState: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    originalVisibilityState = Object.getOwnPropertyDescriptor(
      Document.prototype,
      "visibilityState",
    );
  });

  afterEach(() => {
    if (originalVisibilityState) {
      Object.defineProperty(Document.prototype, "visibilityState", originalVisibilityState);
    }
  });

  function wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }

  function setVisibilityState(state: "visible" | "hidden") {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => state,
    });
  }

  function fireVisibilityChange() {
    document.dispatchEvent(new Event("visibilitychange"));
  }

  it("invalidates snapshot-supersede keys when tab becomes visible", () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(() => useVisibilityRefresh("game-1"), { wrapper });

    setVisibilityState("visible");
    act(() => {
      fireVisibilityChange();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["game-snapshot", "game-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["game", "game-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["leaderboard", "game-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboard-stats", "game-1"] });
  });

  it("does nothing when visibility changes to hidden", () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(() => useVisibilityRefresh("game-1"), { wrapper });

    setVisibilityState("hidden");
    act(() => {
      fireVisibilityChange();
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("is a no-op when gameId is undefined", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    renderHook(() => useVisibilityRefresh(undefined), { wrapper });

    // Should not have wired a visibilitychange listener when gameId is missing
    const visibilityCalls = addSpy.mock.calls.filter(
      (call) => call[0] === "visibilitychange",
    );
    expect(visibilityCalls).toHaveLength(0);
  });

  it("cleans up the listener on unmount", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useVisibilityRefresh("game-1"), { wrapper });

    unmount();

    const visibilityCalls = removeSpy.mock.calls.filter(
      (call) => call[0] === "visibilitychange",
    );
    expect(visibilityCalls.length).toBeGreaterThan(0);
  });

  it("rewires the listener when gameId changes", () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { rerender } = renderHook(
      ({ gameId }) => useVisibilityRefresh(gameId),
      { wrapper, initialProps: { gameId: "game-1" as string | undefined } },
    );

    rerender({ gameId: "game-2" });

    setVisibilityState("visible");
    act(() => {
      fireVisibilityChange();
    });

    // Only the current gameId should have its queries invalidated
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["game-snapshot", "game-2"] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ["game-snapshot", "game-1"] });
  });
});
