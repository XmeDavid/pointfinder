import axios from "axios";
import { useAuthStore } from "@/hooks/useAuth";

const API_URL = import.meta.env.VITE_API_URL || "/api";

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Track if we're currently refreshing to avoid concurrent refresh calls
let isRefreshing = false;
let failedQueue: { resolve: (token: string) => void; reject: (err: unknown) => void }[] = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => {
    if (token) p.resolve(token);
    else p.reject(error);
  });
  failedQueue = [];
}

function forceLogout() {
  useAuthStore.getState().handleAuthFailure();
  // Small delay to let state propagate before redirect
  setTimeout(() => {
    window.location.href = "/login";
  }, 50);
}

// Request interceptor: attach access token from Zustand store
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle auth errors and refresh token
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;

    // 401 = invalid/expired token -> attempt refresh
    if (status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // If already refreshing, queue this request
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(apiClient(originalRequest));
            },
            reject,
          });
        });
      }

      isRefreshing = true;

      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        if (!refreshToken) throw new Error("No refresh token");

        // Call refresh endpoint directly (bypass interceptors to avoid loops)
        const response = await axios.post(`${API_URL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken: newAccessToken, refreshToken: newRefreshToken, user } = response.data;

        // Update Zustand store (this also persists to localStorage)
        useAuthStore.getState().setTokens(newAccessToken, newRefreshToken, user);

        // Process any queued requests with the new token
        processQueue(null, newAccessToken);

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch {
        // Refresh failed - kick to login
        processQueue(error, null);
        forceLogout();
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    // 403 = forbidden - token is valid but user lacks permissions
    // This shouldn't normally trigger logout, but if it happens on basic endpoints
    // it might mean the user's role changed
    if (status === 403) {
      console.warn("Forbidden request:", originalRequest.url);
    }

    return Promise.reject(error);
  }
);

export default apiClient;
