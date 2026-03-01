import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useState } from "react";
import { MapPin, Puzzle, Users, Link2, Bell, UserCog, Settings, LayoutDashboard, Compass, Check } from "lucide-react";
import { Header } from "../Header";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { GameStatus } from "@/types";

interface SetupLayoutProps {
  gameId: string;
  gameStatus?: GameStatus;
}

const SETUP_STEPS = [
  { key: "bases", icon: MapPin, labelKey: "nav.bases", path: "bases" },
  { key: "challenges", icon: Puzzle, labelKey: "nav.challenges", path: "challenges" },
  { key: "teams", icon: Users, labelKey: "nav.teams", path: "teams" },
  { key: "assignments", icon: Link2, labelKey: "nav.assignments", path: "assignments" },
];

const SECONDARY_NAV = [
  { labelKey: "nav.overview", path: "overview", icon: LayoutDashboard },
  { labelKey: "nav.notifications", path: "notifications", icon: Bell },
  { labelKey: "nav.operators", path: "operators", icon: UserCog },
  { labelKey: "nav.settings", path: "settings", icon: Settings },
];

export function SetupLayout({ gameId, gameStatus }: SetupLayoutProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const currentStep = SETUP_STEPS.findIndex((s) =>
    location.pathname.endsWith(`/${s.path}`)
  );

  const activeStep = currentStep >= 0 ? currentStep : -1;

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <Compass className="h-6 w-6 text-sidebar-accent" />
        <span className="text-lg font-bold text-sidebar-foreground">{t("common.appName")}</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {/* Setup stepper */}
        <div className="space-y-1">
          <p className="px-3 text-xs font-semibold uppercase text-sidebar-foreground/50 tracking-wider mb-2">
            {t("nav.gameSetup")}
          </p>
          {SETUP_STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive = idx === activeStep;
            const isDone = idx < activeStep;
            return (
              <NavLink
                key={step.key}
                to={`/games/${gameId}/${step.path}`}
                end
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/10 hover:text-sidebar-foreground"
                )}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors"
                  style={{
                    borderColor: isActive ? "currentColor" : isDone ? "var(--color-primary, #16a34a)" : undefined,
                    backgroundColor: isDone ? "var(--color-primary, #16a34a)" : undefined,
                    color: isDone ? "white" : undefined,
                  }}
                >
                  {isDone ? <Check className="h-3 w-3" /> : idx + 1}
                </span>
                <Icon className="h-4 w-4 shrink-0" />
                {t(step.labelKey)}
              </NavLink>
            );
          })}
        </div>

        {/* Secondary nav */}
        <div className="space-y-1">
          <p className="px-3 text-xs font-semibold uppercase text-sidebar-foreground/50 tracking-wider">
            {t("nav.admin")}
          </p>
          {SECONDARY_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={`/games/${gameId}/${item.path}`}
                end
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/50 hover:bg-sidebar-accent/10 hover:text-sidebar-foreground"
                  )
                }
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {t(item.labelKey)}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed inset-y-0 left-0 flex w-72 flex-col bg-sidebar shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Header
          onMenuToggle={() => setSidebarOpen((o) => !o)}
          gameId={gameId}
          gameStatus={gameStatus}
        />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6">
          <Outlet />
        </main>

        {/* Mobile bottom navigation */}
        <nav className="md:hidden flex border-t border-border bg-background shrink-0">
          {SETUP_STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive = idx === activeStep;
            const isDone = idx < activeStep;
            return (
              <NavLink
                key={step.key}
                to={`/games/${gameId}/${step.path}`}
                end
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-1 py-2 min-h-[56px] text-xs font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : isDone
                    ? "text-green-600"
                    : "text-muted-foreground"
                )}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {isDone && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-green-500">
                      <Check className="h-2 w-2 text-white" />
                    </span>
                  )}
                </span>
                <span>{t(step.labelKey)}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
