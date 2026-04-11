import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types";
import axios from "axios";
import { API_URL } from "@/lib/api/config";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (token: string, name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Called by the API client when tokens are refreshed successfully */
  setTokens: (accessToken: string, refreshToken: string, user: User) => void;
  /** Clear in-memory access token (e.g. after a 401, before retrying via refresh) */
  clearAccessToken: () => void;
  /** Called by the API client on unrecoverable auth failure */
  handleAuthFailure: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      hasHydrated: false,

      login: async (email: string, password: string) => {
        const { data } = await axios.post(`${API_URL}/auth/login`, {
          email,
          password,
        });

        set({
          user: data.user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          isAuthenticated: true,
        });
      },

      register: async (token: string, name: string, email: string, password: string) => {
        const { data } = await axios.post(`${API_URL}/auth/register/${token}`, {
          name,
          email,
          password,
        });

        set({
          user: data.user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          isAuthenticated: true,
        });
      },

      logout: () => {
        const { refreshToken } = get();
        if (refreshToken) {
          // Fire-and-forget logout on the server
          axios.post(`${API_URL}/auth/logout`, { refreshToken }).catch(() => {});
        }
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },

      setTokens: (accessToken: string, refreshToken: string, user: User) => {
        set({ accessToken, refreshToken, user, isAuthenticated: true });
      },

      clearAccessToken: () => {
        set({ accessToken: null });
      },

      handleAuthFailure: () => {
        // Only trigger if we think we're authenticated (avoid loops)
        if (get().isAuthenticated) {
          // Disconnect WebSocket before clearing state to prevent the STOMP
          // client from entering a reconnect loop with no valid token.
          // Lazy import to avoid circular dependency (store → websocket → client → store).
          import("@/lib/api/websocket").then(({ disconnectWebSocket }) => {
            disconnectWebSocket();
          });
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
          });
        }
      },
    }),
    {
      name: "pointfinder-auth",
      partialize: (state) => ({
        // Only persist refresh token and user info — NOT the access token.
        // The access token is kept in-memory only, reducing XSS exposure.
        // On page load, a fresh access token is obtained via the refresh token.
        user: state.user,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Validate: if isAuthenticated but refresh token is missing, reset
          if (state.isAuthenticated && !state.refreshToken) {
            useAuthStore.setState({
              isAuthenticated: false,
              user: null,
              accessToken: null,
              refreshToken: null,
              hasHydrated: true,
            });
            return;
          }
        }
        // Use setState() instead of direct mutation to properly notify subscribers
        useAuthStore.setState({ hasHydrated: true });
      },
    }
  )
);

// Cross-tab auth sync: detect when another tab updates the refresh token
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'pointfinder-auth' && e.newValue) {
      try {
        const { state } = JSON.parse(e.newValue);
        if (state?.refreshToken) {
          useAuthStore.setState({
            refreshToken: state.refreshToken,
            user: state.user,
            isAuthenticated: true,
          });
        } else if (!state?.isAuthenticated) {
          useAuthStore.getState().handleAuthFailure();
        }
      } catch { /* ignore parse errors */ }
    }
  });
}
