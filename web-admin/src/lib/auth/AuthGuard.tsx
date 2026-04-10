import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/store";
import apiClient from "@/lib/api/client";

export function AuthGuard({ children }: { children?: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const handleAuthFailure = useAuthStore((s) => s.handleAuthFailure);
  const { isPending: isVerifyingSession, isError: sessionInvalid } = useQuery({
    queryKey: ["auth-session-verify"],
    enabled: hasHydrated && isAuthenticated,
    retry: 1,
    staleTime: 30_000,
    gcTime: 60_000,
    queryFn: async () => {
      await apiClient.get("/games");
      return true;
    },
  });

  // Clear auth state when session verification fails, so GuestGuard
  // sees isAuthenticated=false and doesn't redirect back here (loop).
  useEffect(() => {
    if (sessionInvalid) {
      handleAuthFailure();
    }
  }, [sessionInvalid, handleAuthFailure]);

  if (!hasHydrated || (isAuthenticated && (isVerifyingSession || sessionInvalid))) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children ?? <Outlet />}</>;
}
