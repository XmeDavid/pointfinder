import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types";
import axios from "axios";
import { API_URL } from "@/lib/api/config";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (token: string, name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Called by the API client when tokens are refreshed successfully */
  setTokens: (accessToken: string, user: User) => void;
  /** Clear in-memory access token (e.g. after a 401, before retrying via refresh) */
  clearAccessToken: () => void;
  /** Called by the API client on unrecoverable auth failure */
  handleAuthFailure: () => void;
}

// Captured reference to the store's `set` function, used by onRehydrateStorage
// which fires during create() before `useAuthStore` is assigned.
let storeSet: ((state: Partial<AuthState>) => void) | null = null;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => {
      storeSet = set;
      return {
      user: null,
      accessToken: null,
      isAuthenticated: false,
      hasHydrated: false,

      login: async (email: string, password: string) => {
        // withCredentials lets the browser accept the HttpOnly refresh-token cookie
        const { data } = await axios.post(`${API_URL}/auth/login`, {
          email,
          password,
        }, { withCredentials: true });

        set({
          user: data.user,
          accessToken: data.accessToken,
          isAuthenticated: true,
        });
      },

      register: async (token: string, name: string, email: string, password: string) => {
        const { data } = await axios.post(`${API_URL}/auth/register/${token}`, {
          name,
          email,
          password,
        }, { withCredentials: true });

        set({
          user: data.user,
          accessToken: data.accessToken,
          isAuthenticated: true,
        });
      },

      logout: () => {
        // Fire-and-forget logout on the server; the HttpOnly cookie is sent automatically
        axios.post(`${API_URL}/auth/logout`, {}, { withCredentials: true }).catch(() => {});
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
        });
      },

      setTokens: (accessToken: string, user: User) => {
        set({ accessToken, user, isAuthenticated: true });
      },

      clearAccessToken: () => {
        set({ accessToken: null });
      },

      handleAuthFailure: () => {
        // Only trigger if we think we're authenticated (avoid loops)
        if (get().isAuthenticated) {
          console.warn("[AUTH] handleAuthFailure called — wiping session", new Error().stack);
          // Disconnect WebSocket before clearing state to prevent the STOMP
          // client from entering a reconnect loop with no valid token.
          // Lazy import to avoid circular dependency (store → websocket → client → store).
          import("@/lib/api/websocket").then(({ disconnectWebSocket }) => {
            disconnectWebSocket();
          });
          set({
            user: null,
            accessToken: null,
            isAuthenticated: false,
          });
        }
      },
    }},
    {
      name: "pointfinder-auth",
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown>;
        if (version === 0) {
          // Audit 12.1: Refresh token moved to HttpOnly cookie.
          // Strip any leftover refresh token from localStorage.
          delete state.refreshToken;
        }
        return state;
      },
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Validate: if isAuthenticated but user is missing, reset
          if (state.isAuthenticated && !state.user) {
            console.warn("[AUTH] onRehydrateStorage: isAuthenticated but no user — resetting");
            storeSet?.({
              isAuthenticated: false,
              user: null,
              accessToken: null,
              hasHydrated: true,
            });
            return;
          }
        }
        // Use captured set() to properly notify subscribers (useAuthStore
        // may not be assigned yet since this fires during create()).
        storeSet?.({ hasHydrated: true });
      },
    }
  )
);

// Cross-tab auth sync: detect when another tab logs in or out
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'pointfinder-auth' && e.newValue) {
      try {
        const { state } = JSON.parse(e.newValue);
        if (state?.isAuthenticated && state?.user) {
          useAuthStore.setState({
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
