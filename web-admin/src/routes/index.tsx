import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { GameShell } from "@/features/game-detail/GameShell";

// Landing
import { LandingPage } from "@/features/landing/LandingPage";
import { PrivacyPage } from "@/features/landing/PrivacyPage";

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
  {
    path: "/privacy",
    element: <PrivacyPage />,
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
    handle: { breadcrumb: "Home" },
    children: [
      {
        path: "games",
        handle: { breadcrumb: "Games" },
        children: [
          { index: true, element: <GamesListPage /> },
          { path: "new", element: <CreateGamePage />, handle: { breadcrumb: "New Game" } },
        ],
      },
      {
        path: "admin",
        handle: { breadcrumb: "Admin" },
        children: [
          {
            path: "operators",
            element: <OperatorsPage />,
            handle: { breadcrumb: "Operators" },
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
    handle: { breadcrumb: "Games" },
    children: [
      {
        index: true,
        element: <Navigate to="overview" replace />,
      },
      { path: "overview", element: <OverviewPage />, handle: { breadcrumb: "Overview" } },
      { path: "operators", element: <GameOperatorsPage />, handle: { breadcrumb: "Operators" } },
      { path: "bases", element: <BasesPage />, handle: { breadcrumb: "Bases" } },
      { path: "challenges", element: <ChallengesPage />, handle: { breadcrumb: "Challenges" } },
      { path: "assignments", element: <AssignmentsPage />, handle: { breadcrumb: "Assignments" } },
      { path: "teams", element: <TeamsPage />, handle: { breadcrumb: "Teams" } },
      { path: "notifications", element: <NotificationsPage />, handle: { breadcrumb: "Notifications" } },
      { path: "settings", element: <SettingsPage />, handle: { breadcrumb: "Settings" } },
      { path: "results", element: <ResultsPage />, handle: { breadcrumb: "Results" } },
      {
        path: "monitor",
        handle: { breadcrumb: "Monitor" },
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "map", element: <MapPage />, handle: { breadcrumb: "Map" } },
          { path: "leaderboard", element: <LeaderboardPage />, handle: { breadcrumb: "Leaderboard" } },
          { path: "activity", element: <ActivityPage />, handle: { breadcrumb: "Activity" } },
          { path: "submissions", element: <SubmissionsPage />, handle: { breadcrumb: "Submissions" } },
          { path: "teams/:teamId", element: <TeamDetailPage />, handle: { breadcrumb: "Team Detail" } },
        ],
      },
    ],
  },
]);
