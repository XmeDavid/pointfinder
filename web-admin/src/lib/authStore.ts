"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AdminUser = {
  id: string;
  email?: string;
  name?: string;
  role?: "admin" | "operator" | "viewer";
};

type AuthState = {
  token: string | null;
  user: AdminUser | null;
  setAuth: (token: string, user: AdminUser) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setAuth: (token, user) => {
        console.log("Setting auth:", { token: token ? "***" : null, user });
        set({ token, user });
      },
      clearAuth: () => {
        console.log("Clearing auth");
        set({ token: null, user: null });
      },
      isAuthenticated: () => {
        const state = get();
        return !!(state.token && state.user);
      },
    }),
    { 
      name: "admin-auth",
    }
  )
);


