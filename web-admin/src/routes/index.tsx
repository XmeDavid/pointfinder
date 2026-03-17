import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { GameShell } from "@/features/game-detail/GameShell";

// Landing
import { LandingPage } from "@/features/landing/LandingPage";
import { FaqPage } from "@/features/faq/FaqPage";

// Auth
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage";

// Admin
import { OperatorsPage } from "@/features/admin/OperatorsPage";

// Games
import { GamesListPage } from "@/features/games/GamesListPage";
import { CreateGamePage } from "@/features/games/CreateGamePage";

// Game Detail
import { OverviewPage } from "@/features/game-detail/OverviewPage";
import { GameOperatorsPage } from "@/features/game-detail/GameOperatorsPage";
import { BasesPage } from "@/features/game-detail/BasesPage";
import { ChallengesPage } from "@/features/game-detail/ChallengesPage";
import { AssignmentsPage } from "@/features/game-detail/AssignmentsPage";
import { TeamsPage } from "@/features/game-detail/TeamsPage";
import { NotificationsPage } from "@/features/game-detail/NotificationsPage";
import { ResultsPage } from "@/features/game-detail/ResultsPage";
import { SettingsPage } from "@/features/game-detail/SettingsPage";

// Monitoring
import { DashboardPage } from "@/features/monitoring/DashboardPage";
import { MapPage } from "@/features/monitoring/MapPage";
import { LeaderboardPage } from "@/features/monitoring/LeaderboardPage";
import { ActivityPage } from "@/features/monitoring/ActivityPage";
import { SubmissionsPage } from "@/features/monitoring/SubmissionsPage";
import { TeamDetailPage } from "@/features/monitoring/TeamDetailPage";

// Live broadcast (public)
import { LiveEntryPage } from "@/features/live/LiveEntryPage";
import { LiveBroadcastPage } from "@/features/live/LiveBroadcastPage";

// Auth guards
import { AuthGuard } from "./AuthGuard";
import { GuestGuard } from "./GuestGuard";

// Error boundary
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

export const router = createBrowserRouter([
  /* -------- Public landing page -------- */
  {
    path: "/",
    element: <LandingPage />,
  },
  /* -------- FAQ page -------- */
  {
    path: "/faq",
    element: <FaqPage />,
  },
  /* -------- Auth pages -------- */
  {
    path: "/login",
    element: (
      <GuestGuard>
        <LoginPage />
      </GuestGuard>
    ),
  },
  {
    path: "/register/:token",
    element: (
      <GuestGuard>
        <RegisterPage />
      </GuestGuard>
    ),
  },
  {
    path: "/forgot-password",
    element: (
      <GuestGuard>
        <ForgotPasswordPage />
      </GuestGuard>
    ),
  },
  {
    path: "/reset-password/:token",
    element: (
      <GuestGuard>
        <ResetPasswordPage />
      </GuestGuard>
    ),
  },

  /* -------- Public live broadcast -------- */
  {
    path: "/live",
    element: <LiveEntryPage />,
  },
  {
    path: "/live/:code",
    element: <LiveBroadcastPage />,
  },

  /* -------- Authenticated admin shell (pathless layout route) -------- */
  {
    element: (
      <AuthGuard>
        <AppShell />
      </AuthGuard>
    ),
    children: [
      {
        path: "games",
        children: [
          { index: true, element: <ErrorBoundary><GamesListPage /></ErrorBoundary> },
          { path: "new", element: <ErrorBoundary><CreateGamePage /></ErrorBoundary> },
        ],
      },
      {
        path: "admin",
        children: [
          {
            path: "operators",
            element: <ErrorBoundary><OperatorsPage /></ErrorBoundary>,
          },
        ],
      },
    ],
  },

  /* -------- Game detail shell -------- */
  {
    path: "/games/:gameId",
    element: (
      <AuthGuard>
        <GameShell />
      </AuthGuard>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="overview" replace />,
      },
      { path: "overview", element: <ErrorBoundary><OverviewPage /></ErrorBoundary> },
      { path: "operators", element: <ErrorBoundary><GameOperatorsPage /></ErrorBoundary> },
      { path: "bases", element: <ErrorBoundary><BasesPage /></ErrorBoundary> },
      { path: "challenges", element: <ErrorBoundary><ChallengesPage /></ErrorBoundary> },
      { path: "assignments", element: <ErrorBoundary><AssignmentsPage /></ErrorBoundary> },
      { path: "teams", element: <ErrorBoundary><TeamsPage /></ErrorBoundary> },
      { path: "notifications", element: <ErrorBoundary><NotificationsPage /></ErrorBoundary> },
      { path: "settings", element: <ErrorBoundary><SettingsPage /></ErrorBoundary> },
      { path: "results", element: <ErrorBoundary><ResultsPage /></ErrorBoundary> },
      {
        path: "monitor",
        children: [
          { index: true, element: <ErrorBoundary><DashboardPage /></ErrorBoundary> },
          { path: "map", element: <ErrorBoundary><MapPage /></ErrorBoundary> },
          { path: "leaderboard", element: <ErrorBoundary><LeaderboardPage /></ErrorBoundary> },
          { path: "activity", element: <ErrorBoundary><ActivityPage /></ErrorBoundary> },
          { path: "submissions", element: <ErrorBoundary><SubmissionsPage /></ErrorBoundary> },
          { path: "teams/:teamId", element: <ErrorBoundary><TeamDetailPage /></ErrorBoundary> },
        ],
      },
    ],
  },
]);
