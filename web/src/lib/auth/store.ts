import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types";
import axios from "@/platform/axios";
import { API_URL } from "@/lib/api/config";

import { isNative } from '@/platform/runtime';
import { saveOperatorSession, clearOperatorSession, takeOperatorRefreshBody, loadOperatorSession } from '@/platform/operatorSession';
import { clearResumeLocation } from '@/app/resume';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  sessionVersion: number;
  login: (email: string, password: string) => Promise<void>;
  register: (token: string, name: string, email: string, password: string) => Promise<void>;
  /**
   * OW-01: an operator who signed in through the player entry holds an
   * account session, not an operator one. The server exchanges that account
   * bearer for a fresh operator token pair after checking the role, so no
   * account or player token is ever copied into this store.
   */
  adoptOrganizerSession: (accountAccessToken: string, expectedAccountId?: string, isAccountCurrent?: () => boolean) => Promise<void>;
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
      sessionVersion: 0,

      login: async (email: string, password: string) => {
        const version = get().sessionVersion + 1;
        set({ sessionVersion: version });
        const current = () => get().sessionVersion === version;
        // withCredentials lets the browser accept the HttpOnly refresh-token cookie
        const { data } = await axios.post(`${API_URL}/auth/login`, {
          email,
          password,
        }, { withCredentials: true });

        if (!current()) throw new Error('Operator session changed');
        await saveOperatorSession(data, current);
        if (!current()) throw new Error('Operator session changed');
        set({
          user: data.user,
          accessToken: data.accessToken,
          isAuthenticated: true,
        });
      },

      register: async (token: string, name: string, email: string, password: string) => {
        const version = get().sessionVersion + 1;
        set({ sessionVersion: version });
        const current = () => get().sessionVersion === version;
        const { data } = await axios.post(`${API_URL}/auth/register/${token}`, {
          name,
          email,
          password,
        }, { withCredentials: true });

        if (!current()) throw new Error('Operator session changed');
        await saveOperatorSession(data, current);
        if (!current()) throw new Error('Operator session changed');
        set({
          user: data.user,
          accessToken: data.accessToken,
          isAuthenticated: true,
        });
      },

      adoptOrganizerSession: async (accountAccessToken: string, expectedAccountId?: string, isAccountCurrent = () => true) => {
        const version = get().sessionVersion + 1;
        set({ sessionVersion: version });
        const current = () => get().sessionVersion === version && isAccountCurrent();
        const { data } = await axios.post(`${API_URL}/account/organizer-session`, {}, {
          withCredentials: true,
          headers: { Authorization: `Bearer ${accountAccessToken}` },
        });
        // The server refuses participants; never let a malformed reply promote one.
        if (!data?.user || !['operator', 'admin'].includes(data.user.role) || !data.accessToken) throw new Error('Organizer role required');
        if (!current() || (expectedAccountId && data.user.id !== expectedAccountId)) throw new Error('Operator session changed');
        await saveOperatorSession(data, current);
        if (!current() || (expectedAccountId && data.user.id !== expectedAccountId)) throw new Error('Operator session changed');
        set({
          user: data.user,
          accessToken: data.accessToken,
          isAuthenticated: true,
        });
      },

      logout: () => {
        // Fire-and-forget logout on the server; the HttpOnly cookie is sent automatically
        void takeOperatorRefreshBody().then((body) =>
          axios.post(`${API_URL}/auth/logout`, body, { withCredentials: true })
        ).catch(() => {});
        // An explicit sign-out is never resumed into.
        clearResumeLocation();
        set({
          sessionVersion: get().sessionVersion + 1,
          user: null,
          accessToken: null,
          isAuthenticated: false,
        });
      },

      setTokens: (accessToken: string, user: User) => {
        set({ accessToken, user, isAuthenticated: true, sessionVersion: get().sessionVersion + (get().user?.id !== user.id ? 1 : 0) });
      },

      clearAccessToken: () => {
        set({ accessToken: null });
      },

      handleAuthFailure: () => {
        // Only trigger if we think we're authenticated (avoid loops)
        if (get().isAuthenticated) {
          void clearOperatorSession();
          clearResumeLocation();
          console.warn("[AUTH] handleAuthFailure called — wiping session", new Error().stack);
          // Disconnect WebSocket before clearing state to prevent the STOMP
          // client from entering a reconnect loop with no valid token.
          // Lazy import to avoid circular dependency (store → websocket → client → store).
          import("@/lib/api/websocket").then(({ disconnectWebSocket }) => {
            disconnectWebSocket();
          });
          set({
            sessionVersion: get().sessionVersion + 1,
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
      skipHydration: isNative(),
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown>;
        if (version === 0) {
          // Audit 12.1: Refresh token moved to HttpOnly cookie.
          // Strip any leftover refresh token from localStorage.
          delete state.refreshToken;
        }
        return state;
      },
      partialize: (state) => isNative() ? {} : ({
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
if (typeof window !== 'undefined' && !isNative()) {
  window.addEventListener('storage', (e) => {
    if (e.key === 'pointfinder-auth' && e.newValue) {
      try {
        const { state } = JSON.parse(e.newValue);
        if (state?.isAuthenticated && state?.user) {
          useAuthStore.setState({
            sessionVersion: useAuthStore.getState().sessionVersion + 1,
            accessToken: null,
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

/** Native restoration happens before rendering either role's routes. */
export async function restoreNativeOperator(): Promise<void> {
  if (!isNative()) return;
  const version = useAuthStore.getState().sessionVersion;
  const session = await loadOperatorSession();
  if (useAuthStore.getState().sessionVersion !== version) return;
  useAuthStore.setState({ user: session?.user ?? null, accessToken: session?.accessToken ?? null, isAuthenticated: !!session, hasHydrated: true });
}
