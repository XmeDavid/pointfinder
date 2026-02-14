import { NavLink, useParams, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Compass,
  LayoutDashboard,
  MapPin,
  Puzzle,
  Users,
  Bell,
  Activity,
  Trophy,
  Radio,
  Shield,
  Link2,
  Settings,
  ClipboardCheck,
  UserCog,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/hooks/useAuth";
import { gamesApi } from "@/lib/api/games";
import { submissionsApi } from "@/lib/api/submissions";
import type { GameStatus } from "@/types";
import { useEffect, useRef } from "react";

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
}

function SidebarLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={true}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/10 hover:text-sidebar-foreground"
        )
      }
    >
      <span className="relative">
        {item.icon}
        {item.badge}
      </span>
      {item.label}
    </NavLink>
  );
}

interface SidebarProps {
  gameStatus?: GameStatus;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ gameStatus, open, onClose }: SidebarProps) {
  const { gameId } = useParams();
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const location = useLocation();
  const isAdmin = user?.role === "admin";
  const onRealtimePage = location.pathname.includes("/monitor") || location.pathname.endsWith("/notifications");

  // Close sidebar on route change (mobile)
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    onCloseRef.current();
  }, [location.pathname]);

  const { data: game } = useQuery({
    queryKey: ["game", gameId],
    queryFn: () => gamesApi.getById(gameId!),
    enabled: !!gameId,
  });

  // Query pending submissions count for the badge
  const { data: submissions = [] } = useQuery({
    queryKey: ["submissions", gameId],
    queryFn: () => submissionsApi.listByGame(gameId!),
    enabled: !!gameId && (gameStatus === "live" || gameStatus === "ended"),
    // Monitoring and notifications pages already use websocket invalidation;
    // keep polling as low-frequency fallback there.
    refetchInterval: onRealtimePage ? 60000 : 15000,
  });

  const pendingCount = submissions.filter((s) => s.status === "pending").length;

  const pendingBadge =
    pendingCount > 0 ? (
      <span className="absolute -top-1 -right-1.5 flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
      </span>
    ) : undefined;

  const mainNav: NavItem[] = [
    { label: t("nav.games"), to: "/games", icon: <Compass className="h-4 w-4" /> },
    ...(isAdmin
      ? [{ label: t("nav.operators"), to: "/admin/operators", icon: <Shield className="h-4 w-4" /> }]
      : []),
  ];

  const gameNav: NavItem[] = gameId
    ? [
        { label: t("nav.overview"), to: `/games/${gameId}/overview`, icon: <LayoutDashboard className="h-4 w-4" /> },
        { label: t("nav.operators"), to: `/games/${gameId}/operators`, icon: <UserCog className="h-4 w-4" /> },
        { label: t("nav.bases"), to: `/games/${gameId}/bases`, icon: <MapPin className="h-4 w-4" /> },
        { label: t("nav.challenges"), to: `/games/${gameId}/challenges`, icon: <Puzzle className="h-4 w-4" /> },
        { label: t("nav.assignments"), to: `/games/${gameId}/assignments`, icon: <Link2 className="h-4 w-4" /> },
        { label: t("nav.teams"), to: `/games/${gameId}/teams`, icon: <Users className="h-4 w-4" /> },
        { label: t("nav.notifications"), to: `/games/${gameId}/notifications`, icon: <Bell className="h-4 w-4" /> },
        { label: t("nav.settings"), to: `/games/${gameId}/settings`, icon: <Settings className="h-4 w-4" /> },
      ]
    : [];

  const monitorNav: NavItem[] =
    gameId && (gameStatus === "live" || gameStatus === "ended")
      ? [
          { label: t("nav.dashboard"), to: `/games/${gameId}/monitor`, icon: <LayoutDashboard className="h-4 w-4" /> },
          { label: t("nav.map"), to: `/games/${gameId}/monitor/map`, icon: <Radio className="h-4 w-4" /> },
          { label: t("nav.leaderboard"), to: `/games/${gameId}/monitor/leaderboard`, icon: <Trophy className="h-4 w-4" /> },
          { label: t("nav.activity"), to: `/games/${gameId}/monitor/activity`, icon: <Activity className="h-4 w-4" /> },
          { label: t("nav.submissions"), to: `/games/${gameId}/monitor/submissions`, icon: <ClipboardCheck className="h-4 w-4" />, badge: pendingBadge },
        ]
      : [];

  const sidebarContent = (
    <>
      <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
        <div className="flex items-center gap-2">
          <Compass className="h-6 w-6 text-sidebar-accent" />
          <span className="text-lg font-bold text-sidebar-foreground">{t("common.appName")}</span>
        </div>
        <button
          onClick={onClose}
          className="md:hidden rounded-md p-1 text-sidebar-foreground/70 hover:bg-sidebar-accent/10 transition-colors"
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <div className="space-y-1">
          {mainNav.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
        </div>

        {gameNav.length > 0 && (
          <div className="space-y-1">
            <p className="px-3 text-xs font-semibold uppercase text-sidebar-foreground/50 tracking-wider">
              {game?.name ?? t("nav.gameSetup")}
            </p>
            {gameNav.map((item) => (
              <SidebarLink key={item.to} item={item} />
            ))}
          </div>
        )}

        {monitorNav.length > 0 && (
          <div className="space-y-1">
            <p className="px-3 text-xs font-semibold uppercase text-sidebar-foreground/50 tracking-wider">
              {t("nav.monitor")}
            </p>
            {monitorNav.map((item) => (
              <SidebarLink key={item.to} item={item} />
            ))}
          </div>
        )}
      </nav>
    </>
  );

  return (
    <>
      {/* Desktop sidebar - always visible */}
      <aside className="hidden md:flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/50" onClick={onClose} />
          {/* Sidebar panel */}
          <aside className="fixed inset-y-0 left-0 flex w-72 flex-col bg-sidebar shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
