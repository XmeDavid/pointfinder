import axios from "axios";
import { useAuthStore } from "@/hooks/useAuth";

const API_URL = import.meta.env.VITE_API_URL || "/api";

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

      // Use raw axios to bypass apiClient interceptors and avoid loops
      const response = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
      const { accessToken: newAccessToken, refreshToken: newRefreshToken, user } = response.data;
      useAuthStore.getState().setTokens(newAccessToken, newRefreshToken, user);
      return newAccessToken as string;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Obtain a valid access token, refreshing if necessary.
 * Safe to call from multiple call-sites concurrently — only one refresh
 * request will be in-flight at a time.
 *
 * @returns The current (or freshly obtained) access token, or `null` if
 *          the user is not authenticated / refresh failed.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const { accessToken, refreshToken, isAuthenticated } = useAuthStore.getState();

  // Happy path: token already available in memory
  if (accessToken) return accessToken;

  // Nothing to refresh with
  if (!isAuthenticated || !refreshToken) return null;

  try {
    return await refreshAccessToken();
  } catch {
    return null;
  }
}

function forceLogout() {
  useAuthStore.getState().handleAuthFailure();
  // Small delay to let state propagate before redirect
  setTimeout(() => {
    window.location.href = "/login";
  }, 50);
}

// ---------------------------------------------------------------------------
// Request interceptor: attach access token, refreshing if needed.
// ---------------------------------------------------------------------------

apiClient.interceptors.request.use(async (config) => {
  const token = await getValidAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---------------------------------------------------------------------------
// Response interceptor: on 401/403, attempt one refresh then retry.
// Uses the same deduplicating refreshAccessToken() so concurrent 401s
// don't each fire their own refresh call.
// ---------------------------------------------------------------------------

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;

    // 401/403 with no prior retry = token may have expired mid-session
    if ((status === 401 || status === 403) && !originalRequest._retry) {
      originalRequest._retry = true;

      // Invalidate the in-memory token so refreshAccessToken() actually fires
      useAuthStore.getState().clearAccessToken();

      try {
        const newToken = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch {
        forceLogout();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
