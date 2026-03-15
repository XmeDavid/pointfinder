import { describe, expect, it, beforeEach, vi, type Mock } from "vitest";
import axios from "axios";
import { useAuthStore } from "@/hooks/useAuth";

// We need to test getValidAccessToken which is exported from client.ts.
// The module also sets up interceptors on an axios instance, but those are
// harder to unit-test in isolation. We focus on the exported function and
// the deduplication logic it relies on.

// Mock axios.post to control the refresh endpoint
vi.mock("axios", async () => {
  const actual = await vi.importActual<typeof import("axios")>("axios");
  const instance = actual.default.create();

  // We need to mock the raw axios.post used by refreshAccessToken
  // (it uses raw axios, not the apiClient, to avoid interceptor loops)
  const mockedAxios = {
    ...actual,
    default: {
      ...actual.default,
      post: vi.fn(),
      create: () => instance,
    },
  };
  return mockedAxios;
});

// Import after mocks are set up
const { getValidAccessToken } = await import("./client");

const mockUser = {
  id: "1",
  email: "test@example.com",
  name: "Test User",
  role: "operator" as const,
  createdAt: "2026-01-01",
};

describe("getValidAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset auth store to clean state
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      hasHydrated: false,
    });
  });

  it("returns access token when already present in store", async () => {
    useAuthStore.getState().setTokens("existing-token", "refresh-tok", mockUser);

    const token = await getValidAccessToken();
    expect(token).toBe("existing-token");
    // Should not call refresh endpoint
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("returns null when not authenticated and no refresh token", async () => {
    const token = await getValidAccessToken();
    expect(token).toBeNull();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("returns null when isAuthenticated is false even with refresh token", async () => {
    useAuthStore.setState({
      accessToken: null,
      refreshToken: "some-refresh",
      isAuthenticated: false,
    });

    const token = await getValidAccessToken();
    expect(token).toBeNull();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("refreshes token when access token is null but authenticated with refresh token", async () => {
    useAuthStore.setState({
      accessToken: null,
      refreshToken: "valid-refresh",
      isAuthenticated: true,
      user: mockUser,
    });

    (axios.post as Mock).mockResolvedValueOnce({
      data: {
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        user: mockUser,
      },
    });

    const token = await getValidAccessToken();
    expect(token).toBe("new-access-token");
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/auth/refresh"),
      { refreshToken: "valid-refresh" },
      { timeout: 10_000 }
    );

    // Verify the store was updated
    const state = useAuthStore.getState();
    expect(state.accessToken).toBe("new-access-token");
    expect(state.refreshToken).toBe("new-refresh-token");
  });

  it("returns null when refresh fails", async () => {
    useAuthStore.setState({
      accessToken: null,
      refreshToken: "expired-refresh",
      isAuthenticated: true,
      user: mockUser,
    });

    (axios.post as Mock).mockRejectedValueOnce(new Error("Refresh failed"));

    const token = await getValidAccessToken();
    expect(token).toBeNull();
  });

  it("deduplicates concurrent refresh calls", async () => {
    useAuthStore.setState({
      accessToken: null,
      refreshToken: "valid-refresh",
      isAuthenticated: true,
      user: mockUser,
    });

    // Create a deferred promise so we can control when the refresh resolves
    let resolveRefresh!: (value: unknown) => void;
    const refreshPromise = new Promise((resolve) => {
      resolveRefresh = resolve;
    });

    (axios.post as Mock).mockReturnValue(refreshPromise);

    // Fire 3 concurrent calls
    const p1 = getValidAccessToken();
    const p2 = getValidAccessToken();
    const p3 = getValidAccessToken();

    // Resolve the single refresh call
    resolveRefresh({
      data: {
        accessToken: "deduped-token",
        refreshToken: "deduped-refresh",
        user: mockUser,
      },
    });

    const [t1, t2, t3] = await Promise.all([p1, p2, p3]);

    // All should get the same token
    expect(t1).toBe("deduped-token");
    expect(t2).toBe("deduped-token");
    expect(t3).toBe("deduped-token");

    // But only ONE refresh call was made
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it("allows a new refresh after the previous one completes", async () => {
    useAuthStore.setState({
      accessToken: null,
      refreshToken: "valid-refresh",
      isAuthenticated: true,
      user: mockUser,
    });

    (axios.post as Mock).mockResolvedValueOnce({
      data: {
        accessToken: "first-token",
        refreshToken: "first-refresh",
        user: mockUser,
      },
    });

    const token1 = await getValidAccessToken();
    expect(token1).toBe("first-token");

    // Now clear the access token to trigger a second refresh
    useAuthStore.getState().clearAccessToken();

    (axios.post as Mock).mockResolvedValueOnce({
      data: {
        accessToken: "second-token",
        refreshToken: "second-refresh",
        user: mockUser,
      },
    });

    const token2 = await getValidAccessToken();
    expect(token2).toBe("second-token");

    // Two separate refresh calls
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  it("clears refresh promise after a failed refresh so retries are possible", async () => {
    useAuthStore.setState({
      accessToken: null,
      refreshToken: "valid-refresh",
      isAuthenticated: true,
      user: mockUser,
    });

    // First refresh fails
    (axios.post as Mock).mockRejectedValueOnce(new Error("Network error"));

    const token1 = await getValidAccessToken();
    expect(token1).toBeNull();

    // Second attempt should try again (not reuse the failed promise)
    (axios.post as Mock).mockResolvedValueOnce({
      data: {
        accessToken: "recovered-token",
        refreshToken: "recovered-refresh",
        user: mockUser,
      },
    });

    const token2 = await getValidAccessToken();
    expect(token2).toBe("recovered-token");

    expect(axios.post).toHaveBeenCalledTimes(2);
  });
});
