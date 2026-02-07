import { Navigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/hooks/useAuth";
import apiClient from "@/lib/api/client";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const [sessionVerified, setSessionVerified] = useState(false);
  const verifyAttempted = useRef(false);

  // After hydration, verify the session is actually valid with the backend
  useEffect(() => {
    if (!hasHydrated || verifyAttempted.current) return;
    verifyAttempted.current = true;

    if (!isAuthenticated || !accessToken) {
      setSessionVerified(true);
      return;
    }

    // Make a lightweight API call to verify the token is accepted by the backend.
    // If it fails with 401, the response interceptor will handle refresh or logout.
    apiClient
      .get("/games")
      .then(() => setSessionVerified(true))
      .catch(() => {
        // The interceptor already handles 401 -> refresh -> logout.
        // If we get here, either refresh succeeded (user stays) or logout happened.
        setSessionVerified(true);
      });
  }, [hasHydrated, isAuthenticated, accessToken]);

  if (!hasHydrated || !sessionVerified) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated || !accessToken) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
