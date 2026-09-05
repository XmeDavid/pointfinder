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
const { getValidAccessToken, default: apiClient } = await import("./client");

const mockUser = {
  id: "1",
  email: "test@example.com",
  name: "Test User",
  role: "operator" as const,
  createdAt: "2026-01-01",
};

describe("getValidAccessToken", () => {
  it.each([200, 401])('does not restore or clear an account after an old refresh returns %s', async (status) => {
    useAuthStore.getState().setTokens('expired', mockUser);
    let finish!: (value: unknown) => void;
    let fail!: (error: unknown) => void;
    (axios.post as Mock).mockReturnValueOnce(new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
    const oldRequest = getValidAccessToken();
    const rejected = expect(oldRequest).rejects.toThrow('Operator session changed');
    await vi.waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
    const nextUser = { ...mockUser, id: 'other' };
    useAuthStore.getState().setTokens('other-token', nextUser);
    if (status === 200) finish({ data: { accessToken: 'old-token', refreshToken: 'old-refresh', user: mockUser } });
    else fail(Object.assign(new Error('Unauthorized'), { isAxiosError: true, response: { status: 401 } }));
    await rejected;
    expect(useAuthStore.getState()).toMatchObject({ accessToken: 'other-token', user: nextUser, isAuthenticated: true });
  });

  it('does not resurrect a logged-out operator when refresh succeeds late', async () => {
    useAuthStore.getState().setTokens('expired', mockUser);
    let finish!: (value: unknown) => void;
    (axios.post as Mock).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const request = getValidAccessToken();
    const rejected = expect(request).rejects.toThrow('Operator session changed');
    await vi.waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
    useAuthStore.getState().logout();
    finish({ data: { accessToken: 'late', refreshToken: 'late-refresh', user: mockUser } });
    await rejected;
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, accessToken: null, user: null });
  });

  it('never retries a previous account request with the next account token', async () => {
    const token = makeJwt(Date.now() / 1000 + 600);
    useAuthStore.getState().setTokens(token, mockUser);
    let fail!: (error: unknown) => void;
    let sentConfig: unknown;
    const adapter = vi.fn((config) => { sentConfig = config; return new Promise<never>((_, reject) => { fail = reject; }); });
    const request = apiClient.get('/test', { adapter });
    const rejected = expect(request).rejects.toThrow('Unauthorized');
    await vi.waitFor(() => expect(adapter).toHaveBeenCalledTimes(1));
    useAuthStore.getState().setTokens('other-token', { ...mockUser, id: 'other' });
    fail(Object.assign(new Error('Unauthorized'), { config: sentConfig, response: { status: 401 }, isAxiosError: true }));
    await rejected;
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(axios.post).not.toHaveBeenCalled();
    expect(useAuthStore.getState().accessToken).toBe('other-token');
  });

  it('preserves login after a transient refresh failure following a 401', async () => {
    useAuthStore.getState().setTokens(makeJwt(Date.now() / 1000 + 600), mockUser);
    (axios.post as Mock).mockRejectedValueOnce(new Error('Offline'));
    const adapter = vi.fn(async (config) => { throw Object.assign(new Error('Unauthorized'), { config, response: { status: 401 }, isAxiosError: true }); });
    await expect(apiClient.get('/test', { adapter })).rejects.toThrow('Unauthorized');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset auth store to clean state
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      hasHydrated: false,
    });
  });

  /** Helper: build a minimal JWT with a given exp timestamp */
  function makeJwt(exp: number): string {
    const header = btoa(JSON.stringify({ alg: "HS256" }));
    const payload = btoa(JSON.stringify({ sub: "1", exp }));
    return `${header}.${payload}.sig`;
  }

  it("returns access token when present and not near expiry", async () => {
    const futureToken = makeJwt(Date.now() / 1000 + 600); // 10 min left
    useAuthStore.getState().setTokens(futureToken, mockUser);

    const token = await getValidAccessToken();
    expect(token).toBe(futureToken);
    // Should not call refresh endpoint
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("proactively refreshes when token is within 60s of expiry", async () => {
    const soonToken = makeJwt(Date.now() / 1000 + 30); // 30s left — within margin
    useAuthStore.setState({
      accessToken: soonToken,
      isAuthenticated: true,
      user: mockUser,
    });

    (axios.post as Mock).mockResolvedValueOnce({
      data: {
        accessToken: "fresh-token",
        refreshToken: "fresh-refresh",
        user: mockUser,
      },
    });

    const token = await getValidAccessToken();
    expect(token).toBe("fresh-token");
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it("treats malformed tokens as expired and refreshes", async () => {
    useAuthStore.setState({
      accessToken: "not-a-jwt",
      isAuthenticated: true,
      user: mockUser,
    });

    (axios.post as Mock).mockResolvedValueOnce({
      data: {
        accessToken: "new-token",
        refreshToken: "new-refresh",
        user: mockUser,
      },
    });

    const token = await getValidAccessToken();
    expect(token).toBe("new-token");
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it("returns null when not authenticated and no refresh token", async () => {
    const token = await getValidAccessToken();
    expect(token).toBeNull();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("returns null when isAuthenticated is false", async () => {
    useAuthStore.setState({
      accessToken: null,
      isAuthenticated: false,
    });

    const token = await getValidAccessToken();
    expect(token).toBeNull();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("refreshes token when access token is null but authenticated (cookie-based)", async () => {
    useAuthStore.setState({
      accessToken: null,
      isAuthenticated: true,
      user: mockUser,
    });

    (axios.post as Mock).mockResolvedValueOnce({
      data: {
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token", // still in response for mobile compat
        user: mockUser,
      },
    });

    const token = await getValidAccessToken();
    expect(token).toBe("new-access-token");
    // Refresh token is sent via HttpOnly cookie, not in request body
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/auth/refresh"),
      {},
      { withCredentials: true, timeout: 10_000, signal: expect.any(AbortSignal) }
    );

    // Verify the store was updated with accessToken (not refreshToken)
    const state = useAuthStore.getState();
    expect(state.accessToken).toBe("new-access-token");
  });

  it("returns null when refresh cookie is permanently rejected (401)", async () => {
    useAuthStore.setState({
      accessToken: null,
      isAuthenticated: true,
      user: mockUser,
    });

    // Simulate an Axios 401 error — axios.isAxiosError checks this flag
    const axiosError = Object.assign(new Error("Request failed"), {
      isAxiosError: true,
      response: { status: 401 },
    });
    (axios.post as Mock).mockRejectedValueOnce(axiosError);

    const token = await getValidAccessToken();
    expect(token).toBeNull();
  });

  it("throws on transient refresh failure so callers can retry", async () => {
    useAuthStore.setState({
      accessToken: null,
      isAuthenticated: true,
      user: mockUser,
    });

    (axios.post as Mock).mockRejectedValueOnce(new Error("Network error"));

    await expect(getValidAccessToken()).rejects.toThrow("Network error");
  });

  it("deduplicates concurrent refresh calls", async () => {
    useAuthStore.setState({
      accessToken: null,
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
      isAuthenticated: true,
      user: mockUser,
    });

    // First refresh fails (transient — throws)
    (axios.post as Mock).mockRejectedValueOnce(new Error("Network error"));

    await expect(getValidAccessToken()).rejects.toThrow("Network error");

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
