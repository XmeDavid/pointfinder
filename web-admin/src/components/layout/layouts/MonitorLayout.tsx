import { Outlet, NavLink } from "react-router-dom";
import { LayoutDashboard, Radio, Trophy, Activity, ClipboardCheck } from "lucide-react";
import { Header } from "../Header";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { submissionsApi } from "@/lib/api/submissions";
import { cn } from "@/lib/utils";
import type { GameStatus } from "@/types";

interface MonitorLayoutProps {
  gameId: string;
  gameStatus?: GameStatus;
}

export function MonitorLayout({ gameId, gameStatus }: MonitorLayoutProps) {
  const { t } = useTranslation();

  const { data: submissions = [] } = useQuery({
    queryKey: ["submissions", gameId],
    queryFn: () => submissionsApi.listByGame(gameId),
    refetchInterval: 15000,
  });

  const pendingCount = submissions.filter((s) => s.status === "pending").length;

  const tabs = [
    { labelKey: "nav.dashboard", path: "", icon: LayoutDashboard, exact: true },
    { labelKey: "nav.map", path: "map", icon: Radio },
    { labelKey: "nav.leaderboard", path: "leaderboard", icon: Trophy },
    { labelKey: "nav.activity", path: "activity", icon: Activity },
    { labelKey: "nav.submissions", path: "submissions", icon: ClipboardCheck, badge: pendingCount },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header gameId={gameId} gameStatus={gameStatus} />

      {/* Tab strip */}
      <div className="border-b border-border bg-background shrink-0">
        <nav className="flex overflow-x-auto scrollbar-none px-4">
          {tabs.map((tab) => {
            const to = tab.path
              ? `/games/${gameId}/monitor/${tab.path}`
              : `/games/${gameId}/monitor`;
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.labelKey}
                to={to}
                end={tab.exact ?? false}
                className={({ isActive }) =>
                  cn(
                    "flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap",
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {t(tab.labelKey)}
                {tab.badge != null && tab.badge > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {tab.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
