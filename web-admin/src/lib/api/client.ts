import axios from "axios";
import { useAuthStore } from "@/hooks/useAuth";
import { API_URL } from "@/lib/api/config";

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// ---------------------------------------------------------------------------
// Token refresh with promise deduplication.
// Only one /auth/refresh call runs at a time; concurrent callers await the
// same promise. This prevents the backend from seeing a second request with
// an already-rotated (invalid) refresh token.
// ---------------------------------------------------------------------------

let refreshPromise: Promise<string> | null = null;

/** Sentinel error for unrecoverable auth failures (expired/revoked refresh token). */
class PermanentAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentAuthError";
  }
}

/**
 * Perform a single token refresh, deduplicating concurrent calls.
 * Returns the new access token or throws on failure.
 */
function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const refreshToken = useAuthStore.getState().refreshToken;
      console.warn("[AUTH] refreshAccessToken: token:", refreshToken?.substring(0, 15) + "...", "isAuthenticated?", useAuthStore.getState().isAuthenticated);
      if (!refreshToken) throw new PermanentAuthError("No refresh token");

      // Use raw axios to bypass apiClient interceptors and avoid loops.
      const response = await axios.post(
        `${API_URL}/auth/refresh`,
        { refreshToken },
        { timeout: 10_000 }
      );
      const { accessToken: newAccessToken, refreshToken: newRefreshToken, user } = response.data;
      if (!newAccessToken || !newRefreshToken) {
        throw new Error("Invalid refresh response: missing tokens");
      }
      useAuthStore.getState().setTokens(newAccessToken, newRefreshToken, user);
      const storedAfter = useAuthStore.getState().refreshToken;
      const lsRaw = localStorage.getItem("pointfinder-auth");
      const lsToken = lsRaw ? JSON.parse(lsRaw)?.state?.refreshToken : null;
      console.warn("[AUTH] refreshAccessToken: SUCCESS",
        "\n  received:", newRefreshToken?.substring(0, 15) + "...",
        "\n  in store:", storedAfter?.substring(0, 15) + "...",
        "\n  in localStorage:", lsToken?.substring(0, 15) + "...",
        "\n  match?", newRefreshToken === storedAfter && storedAfter === lsToken
      );
      return newAccessToken as string;
    } catch (err) {
      // 400/401/403 from refresh endpoint = token is invalid/expired → unrecoverable.
      // (The backend returns 400 for expired or unknown refresh tokens.)
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      const serverMessage = axios.isAxiosError(err) ? err.response?.data : undefined;
      console.warn("[AUTH] refreshAccessToken: FAILED — status:", status, "server:", JSON.stringify(serverMessage), "error:", err instanceof Error ? err.message : err);
      if (status === 400 || status === 401 || status === 403) {
        throw new PermanentAuthError("Refresh token rejected");
      }
      // "No refresh token" is already a PermanentAuthError, re-throw as-is
      if (err instanceof PermanentAuthError) throw err;
      // Everything else (network, 5xx) is transient
      throw err;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Check whether a JWT is expired or within a safety margin of expiry.
 */
function isTokenExpiringSoon(token: string, marginSeconds = 60): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (typeof payload.exp !== "number") return true;
    return payload.exp - marginSeconds <= Date.now() / 1000;
  } catch {
    return true;
  }
}

function forceLogout() {
  console.warn("[AUTH] forceLogout called", new Error().stack);
  useAuthStore.getState().handleAuthFailure();
}

/**
 * Obtain a valid access token, refreshing proactively if needed.
 *
 * - Returns a valid token on success.
 * - Calls forceLogout() and returns null on permanent auth failure.
 * - Throws on transient failure so callers can retry.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const { accessToken, refreshToken, isAuthenticated } = useAuthStore.getState();

  // Happy path: token in memory and not near expiry
  if (accessToken && !isTokenExpiringSoon(accessToken)) return accessToken;

  // Not authenticated at all
  if (!isAuthenticated || !refreshToken) return null;

  try {
    return await refreshAccessToken();
  } catch (err) {
    if (err instanceof PermanentAuthError) {
      // Refresh token is permanently invalid — logout immediately.
      // Don't let unauthenticated requests hit the server.
      forceLogout();
      return null;
    }
    // Transient (network, 5xx) — propagate so callers can retry
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Request interceptor: attach access token, refreshing proactively.
// This is the PRIMARY token management path. The response interceptor
// below is only a safety net for rare edge cases.
// ---------------------------------------------------------------------------

apiClient.interceptors.request.use(async (config) => {
  try {
    const token = await getValidAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // null = not authenticated (or just logged out). Let it through —
    // public endpoints work, protected endpoints 401 naturally.
  } catch {
    // Transient refresh failure. Reject so React Query retries with backoff
    // instead of sending tokenless requests that create 401 noise.
    return Promise.reject(new Error("Token refresh temporarily unavailable"));
  }
  return config;
});

// ---------------------------------------------------------------------------
// Response interceptor: safety net for the rare case where a valid access
// token becomes invalid between the proactive check and the server receiving
// it (e.g., server restart invalidating all tokens).
//
// ONE retry only. If it fails → logout. No complex retry chains.
// ---------------------------------------------------------------------------

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;

    if (status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Force a fresh refresh by clearing the in-memory access token
      useAuthStore.getState().clearAccessToken();

      try {
        const newToken = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch {
        // Any refresh failure here (permanent or transient) → logout.
        // We already tried the proactive path in the request interceptor;
        // if we're here, something is genuinely wrong.
        forceLogout();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
