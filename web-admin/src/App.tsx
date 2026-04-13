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

const LoginPage = lazy(() =>
  import("@/features/auth/LoginPage").then((m) => ({ default: m.LoginPage })),
);

const RegisterPage = lazy(() =>
  import("@/features/auth/RegisterPage").then((m) => ({
    default: m.RegisterPage,
  })),
);

const ForgotPasswordPage = lazy(() =>
  import("@/features/auth/ForgotPasswordPage").then((m) => ({
    default: m.ForgotPasswordPage,
  })),
);

const ResetPasswordPage = lazy(() =>
  import("@/features/auth/ResetPasswordPage").then((m) => ({
    default: m.ResetPasswordPage,
  })),
);

const LandingPage = lazy(() =>
  import("@/features/public/LandingPage").then((m) => ({
    default: m.LandingPage,
  })),
);

const FaqPage = lazy(() =>
  import("@/features/public/FaqPage").then((m) => ({ default: m.FaqPage })),
);

const PrivacyPage = lazy(() =>
  import("@/features/public/PrivacyPage").then((m) => ({
    default: m.PrivacyPage,
  })),
);

const LiveBroadcastPage = lazy(() =>
  import("@/features/broadcast/LiveBroadcastPage").then((m) => ({
    default: m.LiveBroadcastPage,
  })),
);

const LiveEntryPage = lazy(() =>
  import("@/features/broadcast/LiveEntryPage").then((m) => ({
    default: m.LiveEntryPage,
  })),
);

const OrgMembersPage = lazy(() =>
  import("@/features/org/OrgMembersPage").then((m) => ({
    default: m.OrgMembersPage,
  })),
);

const BillingPage = lazy(() =>
  import("@/features/billing/BillingPage").then((m) => ({
    default: m.BillingPage,
  })),
);

const CreateOrgPage = lazy(() =>
  import("@/features/org/CreateOrgPage").then((m) => ({
    default: m.CreateOrgPage,
  })),
);

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
    element: (
      <Suspense fallback={<PageSpinner />}>
        <LandingPage />
      </Suspense>
    ),
  },
  {
    path: "/login",
    element: (
      <GuestGuard>
        <Suspense fallback={<PageSpinner />}>
          <LoginPage />
        </Suspense>
      </GuestGuard>
    ),
  },
  {
    path: "/register/:token?",
    element: (
      <GuestGuard>
        <Suspense fallback={<PageSpinner />}>
          <RegisterPage />
        </Suspense>
      </GuestGuard>
    ),
  },
  {
    path: "/forgot-password",
    element: (
      <GuestGuard>
        <Suspense fallback={<PageSpinner />}>
          <ForgotPasswordPage />
        </Suspense>
      </GuestGuard>
    ),
  },
  {
    path: "/reset-password/:token",
    element: (
      <GuestGuard>
        <Suspense fallback={<PageSpinner />}>
          <ResetPasswordPage />
        </Suspense>
      </GuestGuard>
    ),
  },
  {
    path: "/faq",
    element: (
      <Suspense fallback={<PageSpinner />}>
        <FaqPage />
      </Suspense>
    ),
  },
  {
    path: "/privacy",
    element: (
      <Suspense fallback={<PageSpinner />}>
        <PrivacyPage />
      </Suspense>
    ),
  },
  {
    path: "/broadcast/:code",
    element: (
      <Suspense fallback={<PageSpinner />}>
        <LiveBroadcastPage />
      </Suspense>
    ),
  },
  {
    path: "/live",
    element: (
      <Suspense fallback={<PageSpinner />}>
        <LiveEntryPage />
      </Suspense>
    ),
  },
  {
    path: "/live/:code",
    element: (
      <Suspense fallback={<PageSpinner />}>
        <LiveEntryPage />
      </Suspense>
    ),
  },

  // ── Authenticated routes ────────────────────────────────────────────────
  {
    path: "/dashboard",
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
    path: "/game/:id",
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
  {
    path: "/org/members",
    element: (
      <AuthGuard>
        <AppLayout>
          <Suspense fallback={<PageSpinner />}>
            <OrgMembersPage />
          </Suspense>
        </AppLayout>
      </AuthGuard>
    ),
  },
  {
    path: "/org/resources",
    lazy: () =>
      import("@/features/org/OrgResourcesPage").then((m) => ({
        Component: m.OrgResourcesPage,
      })),
  },
  {
    path: "/org/create",
    element: (
      <AuthGuard>
        <AppLayout>
          <Suspense fallback={<PageSpinner />}>
            <CreateOrgPage />
          </Suspense>
        </AppLayout>
      </AuthGuard>
    ),
  },
  {
    path: "/billing",
    element: (
      <AuthGuard>
        <AppLayout>
          <Suspense fallback={<PageSpinner />}>
            <BillingPage />
          </Suspense>
        </AppLayout>
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
