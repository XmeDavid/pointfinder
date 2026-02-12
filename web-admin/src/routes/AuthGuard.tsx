import { Navigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/hooks/useAuth";
import apiClient from "@/lib/api/client";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const [sessionVerified, setSessionVerified] = useState(false);
  const verifyAttempted = useRef(false);

  // After hydration, verify the session is actually valid with the backend.
  // The access token may be null after page refresh (it's in-memory only);
  // the API client request interceptor will refresh it automatically.
  useEffect(() => {
    if (!hasHydrated || verifyAttempted.current) return;
    verifyAttempted.current = true;

    if (!isAuthenticated) {
      setSessionVerified(true);
      return;
    }

    // Make a lightweight API call to verify the token is accepted by the backend.
    // If the access token is null, the request interceptor will use the refresh
    // token to obtain a new one before sending the request.
    apiClient
      .get("/games")
      .then(() => setSessionVerified(true))
      .catch(() => {
        // The interceptor already handles 401 -> refresh -> logout.
        // If we get here, either refresh succeeded (user stays) or logout happened.
        setSessionVerified(true);
      });
  }, [hasHydrated, isAuthenticated]);

  if (!hasHydrated || !sessionVerified) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
