import { operatorRefreshBody, saveOperatorSession } from '@/platform/operatorSession';
import axios from "@/platform/axios";
import { useAuthStore } from "@/hooks/useAuth";
import { API_URL } from "@/lib/api/config";
import type { InternalAxiosRequestConfig } from 'axios';

const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
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
let refreshVersion = -1;
let refreshUser: string | undefined;
type SessionRequest = InternalAxiosRequestConfig & { _sessionVersion?: number; _sessionUser?: string; _retry?: boolean };
class SessionChangedError extends Error {
  constructor() { super('Operator session changed'); }
}
function sameSession(version: number | undefined, user: string | undefined): boolean {
  const current = useAuthStore.getState();
  return current.sessionVersion === version && current.user?.id === user;
}

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
  const initial = useAuthStore.getState();
  const version = initial.sessionVersion;
  const userId = initial.user?.id;
  if (refreshPromise && refreshVersion === version && refreshUser === userId) return refreshPromise;
  const current = () => sameSession(version, userId) && useAuthStore.getState().isAuthenticated;
  const requireCurrent = () => { if (!current()) throw new SessionChangedError(); };
  refreshVersion = version;
  refreshUser = userId;
  const controller = new AbortController();
  const unsubscribe = useAuthStore.subscribe(() => { if (!current()) controller.abort(); });

  refreshPromise = (async () => {
    try {
      const { isAuthenticated } = useAuthStore.getState();
      if (!isAuthenticated) throw new PermanentAuthError("Not authenticated");

      // Use raw axios to bypass apiClient interceptors and avoid loops.
      // The refresh token is sent automatically via the HttpOnly cookie.
      const body = await operatorRefreshBody();
      requireCurrent();
      const response = await axios.post(
        `${API_URL}/auth/refresh`,
        body,
        { withCredentials: true, timeout: 10_000, signal: controller.signal }
      );
      requireCurrent();
      const { accessToken: newAccessToken, user } = response.data;
      if (!newAccessToken) {
        throw new Error("Invalid refresh response: missing access token");
      }
      if (userId && user?.id !== userId) throw new PermanentAuthError('Refresh belongs to a different operator');
      await saveOperatorSession(response.data, current);
      requireCurrent();
      useAuthStore.getState().setTokens(newAccessToken, user);
      return newAccessToken as string;
    } catch (err) {
      if (!sameSession(version, userId)) throw new SessionChangedError();
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
      unsubscribe();
      if (refreshVersion === version && refreshUser === userId) refreshPromise = null;
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
  const { accessToken, isAuthenticated, sessionVersion, user } = useAuthStore.getState();

  // Happy path: token in memory and not near expiry
  if (accessToken && !isTokenExpiringSoon(accessToken)) return accessToken;

  // Not authenticated at all
  if (!isAuthenticated) return null;

  try {
    return await refreshAccessToken();
  } catch (err) {
    if (!sameSession(sessionVersion, user?.id)) throw new SessionChangedError();
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
  const request = config as SessionRequest;
  const initial = useAuthStore.getState();
  // Retried requests retain their original account boundary.
  request._sessionVersion ??= initial.sessionVersion;
  if (!request._retry) request._sessionUser = initial.user?.id;
  if (!sameSession(request._sessionVersion, request._sessionUser)) throw new SessionChangedError();
  try {
    const token = await getValidAccessToken();
    if (!sameSession(request._sessionVersion, request._sessionUser)) throw new SessionChangedError();
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
  (response) => {
    const request = response.config as SessionRequest;
    if (!sameSession(request._sessionVersion, request._sessionUser)) throw new SessionChangedError();
    return response;
  },
  async (error) => {
    const originalRequest = error.config as SessionRequest | undefined;
    const status = error.response?.status;
    if (!originalRequest || !sameSession(originalRequest._sessionVersion, originalRequest._sessionUser)) return Promise.reject(error);

    if (status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // A concurrent request may already have refreshed this same session.
        const token = useAuthStore.getState().accessToken;
        if (!token || originalRequest.headers.Authorization === `Bearer ${token}`) useAuthStore.getState().clearAccessToken();
        const newToken = useAuthStore.getState().accessToken ?? await refreshAccessToken();
        if (!sameSession(originalRequest._sessionVersion, originalRequest._sessionUser)) throw new SessionChangedError();
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        if (refreshError instanceof PermanentAuthError && sameSession(originalRequest._sessionVersion, originalRequest._sessionUser)) forceLogout();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
