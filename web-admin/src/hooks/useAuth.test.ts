import { describe, expect, it, beforeEach } from "vitest";
import { useAuthStore } from "./useAuth";

describe("useAuthStore", () => {
  beforeEach(() => {
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
});

