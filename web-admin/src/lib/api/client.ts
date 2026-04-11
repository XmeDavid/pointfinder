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
// Shared token refresh with promise deduplication.
// Only one /auth/refresh call runs at a time; concurrent callers await the
// same promise. This prevents the backend from seeing a second request with
// an already-rotated (invalid) refresh token.
// ---------------------------------------------------------------------------

let refreshPromise: Promise<string> | null = null;

/**
 * Perform a single token refresh, deduplicating concurrent calls.
 * Returns the new access token or throws on failure.
 */
function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const refreshToken = useAuthStore.getState().refreshToken;
      if (!refreshToken) throw new Error("No refresh token");

      // Use raw axios to bypass apiClient interceptors and avoid loops.
      // Timeout prevents hanging if refresh endpoint is unresponsive.
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
      return newAccessToken as string;
    } catch (err) {
      // Distinguish permanent auth failures from transient errors.
      // 401/403 = refresh token is invalid/expired → unrecoverable.
      // Network errors / 5xx = transient → let callers decide whether to retry.
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 401 || status === 403) {
        throw new PermanentAuthError("Refresh token rejected");
      }
      throw err;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/** Sentinel error for unrecoverable auth failures (expired/revoked refresh token). */
class PermanentAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentAuthError";
  }
}

/**
 * Check whether a JWT is expired or within a safety margin of expiry.
 * Decodes the payload (no signature verification needed — the server
 * validates on receipt) and compares `exp` against the current time.
 */
function isTokenExpiringSoon(token: string, marginSeconds = 60): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (typeof payload.exp !== "number") return true; // no exp → treat as expired
    return payload.exp - marginSeconds <= Date.now() / 1000;
  } catch {
    return true; // malformed → treat as expired
  }
}

/**
 * Obtain a valid access token, refreshing if necessary.
 * Safe to call from multiple call-sites concurrently — only one refresh
 * request will be in-flight at a time.
 *
 * @returns The current (or freshly obtained) access token, or `null` if
 *          the user is not authenticated.
 * @throws  On transient refresh failures (network, 5xx) so callers can retry.
 *          Permanent auth failures (401/403) return `null` after clearing state.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const { accessToken, refreshToken, isAuthenticated } = useAuthStore.getState();

  // Happy path: token available in memory and not near expiry
  if (accessToken && !isTokenExpiringSoon(accessToken)) return accessToken;

  // Nothing to refresh with
  if (!isAuthenticated || !refreshToken) return null;

  try {
    return await refreshAccessToken();
  } catch (err) {
    // Permanent auth failure (expired/revoked refresh token) → not recoverable
    if (err instanceof PermanentAuthError) return null;
    // Transient failure (network, timeout, 5xx) → propagate so callers can retry
    throw err;
  }
}

function forceLogout() {
  // handleAuthFailure() sets isAuthenticated=false, which AuthGuard observes
  // via Zustand subscription and declaratively renders <Navigate to="/login" />.
  // No hard window.location.href needed — SPA transition preserves app state.
  useAuthStore.getState().handleAuthFailure();
}

// ---------------------------------------------------------------------------
// Request interceptor: attach access token, refreshing if needed.
// ---------------------------------------------------------------------------

apiClient.interceptors.request.use(async (config) => {
  try {
    const token = await getValidAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // If token is null and we're authenticated, the refresh token is
    // permanently invalid → let the request go through unauthenticated.
    // The 401 response interceptor will handle cleanup.
  } catch {
    // Transient refresh failure (network, timeout). Let the request go
    // through — it will likely 401, and the response interceptor will
    // retry with a fresh refresh attempt.
  }
  return config;
});

// ---------------------------------------------------------------------------
// Response interceptor: on 401, attempt one refresh then retry.
// Uses the same deduplicating refreshAccessToken() so concurrent 401s
// don't each fire their own refresh call.
// ---------------------------------------------------------------------------

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;

    // 401 with no prior retry = token may have expired mid-session
    if (status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Invalidate the in-memory token so refreshAccessToken() actually fires
      useAuthStore.getState().clearAccessToken();

      try {
        const newToken = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch (refreshErr) {
        // Only force logout on permanent auth failure (expired/revoked refresh token).
        // Transient errors (network, 5xx) propagate to let the caller handle/retry.
        if (refreshErr instanceof PermanentAuthError) {
          forceLogout();
        }
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
