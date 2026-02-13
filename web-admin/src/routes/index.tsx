import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { GameShell } from "@/features/game-detail/GameShell";

// Landing
import { LandingPage } from "@/features/landing/LandingPage";

// Auth
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";

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

// Auth guards
import { AuthGuard } from "./AuthGuard";
import { GuestGuard } from "./GuestGuard";

export const router = createBrowserRouter([
  /* -------- Public landing page -------- */
  {
    path: "/",
    element: <LandingPage />,
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
          { index: true, element: <GamesListPage /> },
          { path: "new", element: <CreateGamePage /> },
        ],
      },
      {
        path: "admin",
        children: [
          {
            path: "operators",
            element: <OperatorsPage />,
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
      { path: "overview", element: <OverviewPage /> },
      { path: "operators", element: <GameOperatorsPage /> },
      { path: "bases", element: <BasesPage /> },
      { path: "challenges", element: <ChallengesPage /> },
      { path: "assignments", element: <AssignmentsPage /> },
      { path: "teams", element: <TeamsPage /> },
      { path: "notifications", element: <NotificationsPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "results", element: <ResultsPage /> },
      {
        path: "monitor",
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "map", element: <MapPage /> },
          { path: "leaderboard", element: <LeaderboardPage /> },
          { path: "activity", element: <ActivityPage /> },
          { path: "submissions", element: <SubmissionsPage /> },
          { path: "teams/:teamId", element: <TeamDetailPage /> },
        ],
      },
    ],
  },
]);
