import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080/api";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (token: string, name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
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
    }),
    {
      name: "scout-auth",
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.hasHydrated = true;
        }
      },
    }
  )
);
