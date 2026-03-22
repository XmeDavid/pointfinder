import { createBrowserRouter, Navigate } from "react-router-dom";
import { lazy } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { GameShell } from "@/features/game-detail/GameShell";
import { LazyPage } from "./LazyPage";

// Landing (eager)
import { LandingPage } from "@/features/landing/LandingPage";

// Auth (eager)
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage";

// Public pages (lazy)
const FaqPage = lazy(() => import("@/features/faq/FaqPage").then(m => ({ default: m.FaqPage })));
const LiveEntryPage = lazy(() => import("@/features/live/LiveEntryPage").then(m => ({ default: m.LiveEntryPage })));
const LiveBroadcastPage = lazy(() => import("@/features/live/LiveBroadcastPage").then(m => ({ default: m.LiveBroadcastPage })));

// Admin (lazy)
const OperatorsPage = lazy(() => import("@/features/admin/OperatorsPage").then(m => ({ default: m.OperatorsPage })));

// Games (lazy)
const GamesListPage = lazy(() => import("@/features/games/GamesListPage").then(m => ({ default: m.GamesListPage })));
const CreateGamePage = lazy(() => import("@/features/games/CreateGamePage").then(m => ({ default: m.CreateGamePage })));

// Game Detail (lazy)
const OverviewPage = lazy(() => import("@/features/game-detail/OverviewPage").then(m => ({ default: m.OverviewPage })));
const GameOperatorsPage = lazy(() => import("@/features/game-detail/GameOperatorsPage").then(m => ({ default: m.GameOperatorsPage })));
const BasesPage = lazy(() => import("@/features/game-detail/BasesPage").then(m => ({ default: m.BasesPage })));
const ChallengesPage = lazy(() => import("@/features/game-detail/ChallengesPage").then(m => ({ default: m.ChallengesPage })));
const AssignmentsPage = lazy(() => import("@/features/game-detail/AssignmentsPage").then(m => ({ default: m.AssignmentsPage })));
const TeamsPage = lazy(() => import("@/features/game-detail/TeamsPage").then(m => ({ default: m.TeamsPage })));
const NotificationsPage = lazy(() => import("@/features/game-detail/NotificationsPage").then(m => ({ default: m.NotificationsPage })));
const ResultsPage = lazy(() => import("@/features/game-detail/ResultsPage").then(m => ({ default: m.ResultsPage })));
const SettingsPage = lazy(() => import("@/features/game-detail/SettingsPage").then(m => ({ default: m.SettingsPage })));

// Monitoring (lazy)
const DashboardPage = lazy(() => import("@/features/monitoring/DashboardPage").then(m => ({ default: m.DashboardPage })));
const MapPage = lazy(() => import("@/features/monitoring/MapPage").then(m => ({ default: m.MapPage })));
const LeaderboardPage = lazy(() => import("@/features/monitoring/LeaderboardPage").then(m => ({ default: m.LeaderboardPage })));
const ActivityPage = lazy(() => import("@/features/monitoring/ActivityPage").then(m => ({ default: m.ActivityPage })));
const SubmissionsPage = lazy(() => import("@/features/monitoring/SubmissionsPage").then(m => ({ default: m.SubmissionsPage })));
const TeamDetailPage = lazy(() => import("@/features/monitoring/TeamDetailPage").then(m => ({ default: m.TeamDetailPage })));

// Auth guards
import { AuthGuard } from "./AuthGuard";
import { GuestGuard } from "./GuestGuard";


export const router = createBrowserRouter([
  /* -------- Public landing page -------- */
  {
    path: "/",
    element: <LandingPage />,
  },
  /* -------- FAQ page -------- */
  {
    path: "/faq",
    element: <LazyPage component={FaqPage} />,
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
    path: "/register/:token?",
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
    element: <LazyPage component={LiveEntryPage} />,
  },
  {
    path: "/live/:code",
    element: <LazyPage component={LiveBroadcastPage} />,
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
          { index: true, element: <LazyPage component={GamesListPage} /> },
          { path: "new", element: <LazyPage component={CreateGamePage} /> },
        ],
      },
      {
        path: "admin",
        children: [
          {
            path: "operators",
            element: <LazyPage component={OperatorsPage} />,
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
      { path: "overview", element: <LazyPage component={OverviewPage} /> },
      { path: "operators", element: <LazyPage component={GameOperatorsPage} /> },
      { path: "bases", element: <LazyPage component={BasesPage} /> },
      { path: "challenges", element: <LazyPage component={ChallengesPage} /> },
      { path: "assignments", element: <LazyPage component={AssignmentsPage} /> },
      { path: "teams", element: <LazyPage component={TeamsPage} /> },
      { path: "notifications", element: <LazyPage component={NotificationsPage} /> },
      { path: "settings", element: <LazyPage component={SettingsPage} /> },
      { path: "results", element: <LazyPage component={ResultsPage} /> },
      {
        path: "monitor",
        children: [
          { index: true, element: <LazyPage component={DashboardPage} /> },
          { path: "map", element: <LazyPage component={MapPage} /> },
          { path: "leaderboard", element: <LazyPage component={LeaderboardPage} /> },
          { path: "activity", element: <LazyPage component={ActivityPage} /> },
          { path: "submissions", element: <LazyPage component={SubmissionsPage} /> },
          { path: "teams/:teamId", element: <LazyPage component={TeamDetailPage} /> },
        ],
      },
    ],
  },
]);
