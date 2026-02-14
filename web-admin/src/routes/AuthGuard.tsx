import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/hooks/useAuth";
import apiClient from "@/lib/api/client";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const { isPending: isVerifyingSession, isError: sessionInvalid } = useQuery({
    queryKey: ["auth-session-verify", isAuthenticated],
    enabled: hasHydrated && isAuthenticated,
    retry: false,
    queryFn: async () => {
      // If the access token is null, the interceptor will refresh using the refresh token.
      await apiClient.get("/games");
      return true;
    },
  });

  if (!hasHydrated || (isAuthenticated && isVerifyingSession)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated || sessionInvalid) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
