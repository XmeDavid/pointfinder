import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/store";
import apiClient from "@/lib/api/client";
import axios from "axios";

/**
 * Returns true if the error is a definitive auth rejection (401/403),
 * meaning the session is permanently invalid and the user must re-login.
 * Network errors, timeouts, and 5xx are transient — not auth failures.
 */
function isAuthError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    return status === 401 || status === 403;
  }
  return false;
}

export function AuthGuard({ children }: { children?: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const handleAuthFailure = useAuthStore((s) => s.handleAuthFailure);
  const {
    isPending: isVerifyingSession,
    isError: sessionCheckFailed,
    error: sessionError,
    refetch,
  } = useQuery({
    queryKey: ["auth-session-verify"],
    enabled: hasHydrated && isAuthenticated,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    staleTime: 30_000,
    gcTime: 60_000,
    queryFn: async () => {
      await apiClient.get("/games");
      return true;
    },
  });

  const isSessionAuthError = sessionCheckFailed && isAuthError(sessionError);
  const isSessionTransientError = sessionCheckFailed && !isAuthError(sessionError);

  // Only clear auth on definitive auth rejection (401/403).
  // Transient errors (network, 5xx) show retry UI instead of logging out.
  useEffect(() => {
    if (isSessionAuthError) {
      handleAuthFailure();
    }
  }, [isSessionAuthError, handleAuthFailure]);

  if (!hasHydrated || (isAuthenticated && isVerifyingSession)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Transient error: show retry UI instead of logging out
  if (isAuthenticated && isSessionTransientError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">
          Connection error. Check your network and try again.
        </p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium cursor-pointer hover:bg-primary/90 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children ?? <Outlet />}</>;
}
