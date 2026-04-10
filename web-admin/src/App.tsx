import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import { useAuthStore } from "@/lib/auth/store";
import { ErrorBoundary, AppErrorFallback } from "@/components/feedback/ErrorBoundary";
import { Toaster } from "@/components/ui/toast";
import { AuthGuard } from "@/lib/auth/AuthGuard";
import { GuestGuard } from "@/lib/auth/GuestGuard";
import { IconRail } from "@/components/layout/IconRail";

// ---------------------------------------------------------------------------
// Lazy-loaded feature pages
// ---------------------------------------------------------------------------
const DashboardPage = lazy(() =>
  import("@/features/dashboard/DashboardPage").then((m) => ({
    default: m.DashboardPage,
  })),
);

const GameWorkspace = lazy(() =>
  import("@/features/workspace/GameWorkspace").then((m) => ({
    default: m.GameWorkspace,
  })),
);

// ---------------------------------------------------------------------------
// Placeholder for routes whose feature pages don't exist yet (Phase 2+)
// ---------------------------------------------------------------------------
function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex h-screen items-center justify-center text-muted-foreground text-sm">
      {label} — coming soon
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spinner shown while lazy chunks load
// ---------------------------------------------------------------------------
function PageSpinner() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout wrappers
// ---------------------------------------------------------------------------
function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <IconRail showModes={false} />
      <main className="flex-1 relative overflow-hidden pb-14 md:pb-0">
        {children}
      </main>
    </div>
  );
}

function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <IconRail showModes={true} />
      <main className="flex-1 relative overflow-hidden pb-14 md:pb-0">
        {children}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Query client
// ---------------------------------------------------------------------------
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: false } },
});

// Clear all cached query data when the user logs out, so the next
// login never shows stale data from a different account.
useAuthStore.subscribe((state, prevState) => {
  if (prevState.isAuthenticated && !state.isAuthenticated) {
    queryClient.clear();
  }
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const router = createBrowserRouter([
  // ── Public routes ──────────────────────────────────────────────────────
  {
    path: "/",
    element: <Placeholder label="Landing page" />,
  },
  {
    path: "/login",
    element: (
      <GuestGuard>
        <Placeholder label="Login" />
      </GuestGuard>
    ),
  },
  {
    path: "/register/:token?",
    element: (
      <GuestGuard>
        <Placeholder label="Register" />
      </GuestGuard>
    ),
  },
  {
    path: "/forgot-password",
    element: (
      <GuestGuard>
        <Placeholder label="Forgot password" />
      </GuestGuard>
    ),
  },
  {
    path: "/reset-password/:token",
    element: (
      <GuestGuard>
        <Placeholder label="Reset password" />
      </GuestGuard>
    ),
  },
  {
    path: "/faq",
    element: <Placeholder label="FAQ" />,
  },
  {
    path: "/privacy",
    element: <Placeholder label="Privacy policy" />,
  },
  {
    path: "/broadcast/:code",
    element: <Placeholder label="Broadcast" />,
  },
  {
    path: "/live",
    element: <Placeholder label="Live" />,
  },
  {
    path: "/live/:code",
    element: <Placeholder label="Live" />,
  },

  // ── Authenticated routes ───────────────────────────────────────────────
  {
    path: "/app/dashboard",
    element: (
      <AuthGuard>
        <AppLayout>
          <Suspense fallback={<PageSpinner />}>
            <DashboardPage />
          </Suspense>
        </AppLayout>
      </AuthGuard>
    ),
  },
  {
    path: "/app/game/:id",
    element: (
      <AuthGuard>
        <GameLayout>
          <Suspense fallback={<PageSpinner />}>
            <GameWorkspace />
          </Suspense>
        </GameLayout>
      </AuthGuard>
    ),
  },

  // ── Catch-all ──────────────────────────────────────────────────────────
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);

// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------
export default function App() {
  return (
    <ErrorBoundary fallback={<AppErrorFallback />}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
