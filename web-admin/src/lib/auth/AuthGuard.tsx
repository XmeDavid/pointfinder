import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/lib/auth/store";

/**
 * Protects authenticated routes.
 *
 * Waits for Zustand to hydrate from localStorage before deciding.
 * Once hydrated, checks isAuthenticated — if false, redirects to login.
 *
 * No verification query needed: the request interceptor proactively
 * refreshes tokens, and if the refresh token is permanently invalid,
 * forceLogout() is called immediately (setting isAuthenticated=false).
 * The first real API call in the child component naturally verifies
 * the session.
 */
export function AuthGuard({ children }: { children?: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  if (!hasHydrated) {
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
