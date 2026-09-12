import { useAuth } from '@/app/player/services';
import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/lib/auth/store";

/**
 * Wraps public-only routes (login, register).
 * If the user is already authenticated, redirects them into the platform.
 * Note: accessToken may be null after page refresh (it's in-memory only),
 * but isAuthenticated persisted in localStorage (plus the HttpOnly refresh
 * cookie) is enough to know the user has an active session.
 */
export function GuestGuard({ children, allowParticipant = false }: { children: React.ReactNode; allowParticipant?: boolean }) {
  const player = useAuth();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.user?.role);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  // Wait for Zustand to rehydrate from localStorage before deciding
  if (player.kind === "player" && !isAuthenticated) return <Navigate to="/" replace />;

  if (!hasHydrated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // A participant account has no operator home. Only the login page handles
  // one (it signs the session out and explains where to play), so only there
  // does the guard leave it alone instead of carrying it to the dashboard.
  if (isAuthenticated && !(allowParticipant && role === "participant")) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
