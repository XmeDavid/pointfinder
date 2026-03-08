import { describe, expect, it, beforeEach } from "vitest";
import { useGameLayoutStore } from "./useGameLayout";

describe("useGameLayoutStore", () => {
  beforeEach(() => {
    // Reset store state between tests
    useGameLayoutStore.setState({ layouts: {} });
  });

  it("returns 'classic' as default layout for unknown game", () => {
    expect(useGameLayoutStore.getState().getLayout("unknown-game")).toBe(
      "classic",
    );
  });

  it("sets and retrieves layout for a game", () => {
    useGameLayoutStore.getState().setLayout("game-1", "setup");
    expect(useGameLayoutStore.getState().getLayout("game-1")).toBe("setup");
  });

  it("handles multiple games with different layouts", () => {
    const store = useGameLayoutStore.getState();
    store.setLayout("game-1", "setup");
    store.setLayout("game-2", "monitor");
    store.setLayout("game-3", "review");

    // Re-get state after mutations
    const state = useGameLayoutStore.getState();
    expect(state.getLayout("game-1")).toBe("setup");
    expect(state.getLayout("game-2")).toBe("monitor");
    expect(state.getLayout("game-3")).toBe("review");
  });

  it("overwrites layout when set again for the same game", () => {
    useGameLayoutStore.getState().setLayout("game-1", "setup");
    useGameLayoutStore.getState().setLayout("game-1", "review");
    expect(useGameLayoutStore.getState().getLayout("game-1")).toBe("review");
  });

  it("does not affect other games when updating one", () => {
    useGameLayoutStore.getState().setLayout("game-1", "setup");
    useGameLayoutStore.getState().setLayout("game-2", "monitor");
    useGameLayoutStore.getState().setLayout("game-1", "review");

    expect(useGameLayoutStore.getState().getLayout("game-2")).toBe("monitor");
  });
});
