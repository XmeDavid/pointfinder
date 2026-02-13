import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "/api";

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
      name: "scout-auth",
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
            state.isAuthenticated = false;
            state.user = null;
            state.accessToken = null;
            state.refreshToken = null;
          }
          state.hasHydrated = true;
        }
      },
    }
  )
);
