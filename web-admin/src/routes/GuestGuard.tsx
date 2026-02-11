import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/hooks/useAuth";

/**
 * Wraps public-only routes (login, register).
 * If the user is already authenticated, redirects them into the platform.
 */
export function GuestGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  // Wait for Zustand to rehydrate from localStorage before deciding
  if (!hasHydrated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isAuthenticated && accessToken) {
    return <Navigate to="/games" replace />;
  }

  return <>{children}</>;
}
