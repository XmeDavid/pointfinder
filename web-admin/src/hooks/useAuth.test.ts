import { describe, expect, it, beforeEach } from "vitest";
import { useAuthStore } from "./useAuth";

describe("useAuthStore", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset store state between tests
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      hasHydrated: false,
    });
  });

  it("starts unauthenticated", () => {
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
  });

  it("setTokens marks authenticated", () => {
    const user = { id: "1", email: "a@b.com", name: "A", role: "operator" as const, createdAt: "" };
    useAuthStore.getState().setTokens("access", "refresh", user);

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.accessToken).toBe("access");
    expect(state.refreshToken).toBe("refresh");
    expect(state.user?.email).toBe("a@b.com");
  });

  it("clearAccessToken nulls only access token", () => {
    const user = { id: "1", email: "a@b.com", name: "A", role: "operator" as const, createdAt: "" };
    useAuthStore.getState().setTokens("access", "refresh", user);
    useAuthStore.getState().clearAccessToken();

    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBe("refresh");
    expect(state.isAuthenticated).toBe(true);
  });

  it("handleAuthFailure resets all auth state", () => {
    const user = { id: "1", email: "a@b.com", name: "A", role: "operator" as const, createdAt: "" };
    useAuthStore.getState().setTokens("access", "refresh", user);
    useAuthStore.getState().handleAuthFailure();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
  });

  it("handleAuthFailure does not loop when already unauthenticated", () => {
    // Should be a no-op, not throw
    useAuthStore.getState().handleAuthFailure();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("logout clears all state", () => {
    const user = { id: "1", email: "a@b.com", name: "A", role: "operator" as const, createdAt: "" };
    useAuthStore.getState().setTokens("access", "refresh", user);
    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
  });

  it("setTokens updates all auth fields atomically in a single state update", () => {
    const user = { id: "42", email: "test@example.com", name: "Test", role: "operator" as const, createdAt: "2026-01-01" };

    // Subscribe to track intermediate state changes
    const stateSnapshots: Array<{ isAuthenticated: boolean; accessToken: string | null; refreshToken: string | null; user: unknown }> = [];
    const unsub = useAuthStore.subscribe((state) => {
      stateSnapshots.push({
        isAuthenticated: state.isAuthenticated,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
      });
    });

    useAuthStore.getState().setTokens("new-access", "new-refresh", user);
    unsub();

    // Should produce exactly one state update (atomic), not multiple partial updates
    expect(stateSnapshots).toHaveLength(1);

    // The single update should have all fields set together
    const snapshot = stateSnapshots[0];
    expect(snapshot.isAuthenticated).toBe(true);
    expect(snapshot.accessToken).toBe("new-access");
    expect(snapshot.refreshToken).toBe("new-refresh");
    expect(snapshot.user).toEqual(user);
  });

  it("hydrates from localStorage on store initialization", () => {
    const user = { id: "1", email: "stored@test.com", name: "Stored", role: "operator" as const, createdAt: "" };

    // Simulate what zustand persist writes to localStorage
    const persistedState = {
      state: {
        user,
        refreshToken: "persisted-refresh",
        isAuthenticated: true,
      },
      version: 0,
    };
    localStorage.setItem("pointfinder-auth", JSON.stringify(persistedState));

    // Force rehydration by calling the persist API
    useAuthStore.persist.rehydrate();

    const state = useAuthStore.getState();
    expect(state.user).toEqual(user);
    expect(state.refreshToken).toBe("persisted-refresh");
    expect(state.isAuthenticated).toBe(true);
    expect(state.hasHydrated).toBe(true);
    // Access token is NOT persisted (security: in-memory only)
    expect(state.accessToken).toBeNull();
  });
});

