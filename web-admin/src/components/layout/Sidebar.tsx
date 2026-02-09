import { NavLink, useParams } from "react-router-dom";
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
  SlidersHorizontal,
  ClipboardCheck,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/hooks/useAuth";
import { gamesApi } from "@/lib/api/games";
import type { GameStatus } from "@/types";

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
}

function SidebarLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={true}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/10 hover:text-sidebar-foreground"
        )
      }
    >
      {item.icon}
      {item.label}
    </NavLink>
  );
}

export function Sidebar({ gameStatus }: { gameStatus?: GameStatus }) {
  const { gameId } = useParams();
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const isAdmin = user?.role === "admin";

  const { data: game } = useQuery({
    queryKey: ["game", gameId],
    queryFn: () => gamesApi.getById(gameId!),
    enabled: !!gameId,
  });

  const mainNav: NavItem[] = [
    { label: t("nav.games"), to: "/games", icon: <Compass className="h-4 w-4" /> },
    ...(isAdmin
      ? [{ label: t("nav.operators"), to: "/admin/operators", icon: <Shield className="h-4 w-4" /> }]
      : []),
  ];

  const gameNav: NavItem[] = gameId
    ? [
        { label: t("nav.overview"), to: `/games/${gameId}/overview`, icon: <Settings className="h-4 w-4" /> },
        { label: t("nav.operators"), to: `/games/${gameId}/operators`, icon: <UserCog className="h-4 w-4" /> },
        { label: t("nav.bases"), to: `/games/${gameId}/bases`, icon: <MapPin className="h-4 w-4" /> },
        { label: t("nav.challenges"), to: `/games/${gameId}/challenges`, icon: <Puzzle className="h-4 w-4" /> },
        { label: t("nav.assignments"), to: `/games/${gameId}/assignments`, icon: <Link2 className="h-4 w-4" /> },
        { label: t("nav.teams"), to: `/games/${gameId}/teams`, icon: <Users className="h-4 w-4" /> },
        { label: t("nav.notifications"), to: `/games/${gameId}/notifications`, icon: <Bell className="h-4 w-4" /> },
        { label: t("nav.settings"), to: `/games/${gameId}/settings`, icon: <SlidersHorizontal className="h-4 w-4" /> },
      ]
    : [];

  const monitorNav: NavItem[] =
    gameId && (gameStatus === "live" || gameStatus === "ended")
      ? [
          { label: t("nav.dashboard"), to: `/games/${gameId}/monitor`, icon: <LayoutDashboard className="h-4 w-4" /> },
          { label: t("nav.map"), to: `/games/${gameId}/monitor/map`, icon: <Radio className="h-4 w-4" /> },
          { label: t("nav.leaderboard"), to: `/games/${gameId}/monitor/leaderboard`, icon: <Trophy className="h-4 w-4" /> },
          { label: t("nav.activity"), to: `/games/${gameId}/monitor/activity`, icon: <Activity className="h-4 w-4" /> },
          { label: t("nav.submissions"), to: `/games/${gameId}/monitor/submissions`, icon: <ClipboardCheck className="h-4 w-4" /> },
        ]
      : [];

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <Compass className="h-6 w-6 text-sidebar-accent" />
        <span className="text-lg font-bold text-sidebar-foreground">{t("common.appName")}</span>
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

    
    </aside>
  );
}
