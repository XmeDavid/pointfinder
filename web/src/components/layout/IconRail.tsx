import { useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Settings,
  Sun,
  Moon,
  FolderOpen,
  Shield,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspace";
import { NAV_MODES, navModeOf } from "./workspaceModes";
import { cn } from "@/lib/utils";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { useWorkspaceContext } from "@/stores/workspaceContext";
import { useAuthStore } from "@/lib/auth/store";
import { UserAvatarMenu } from "./UserAvatarMenu";
import { BrandMark } from "@/components/brand";

const THEME_KEY = "pointfinder-theme";

function useThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem(THEME_KEY);
    if (stored) return stored === "dark";
    return true; // default to dark
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
  }, [isDark]);

  const toggle = useCallback(() => setIsDark((prev) => !prev), []);

  return { isDark, toggle };
}

function ModeButton({
  Icon,
  label,
  isActive,
  onClick,
  sizeClass,
  testId,
}: {
  Icon: LucideIcon;
  label: string;
  isActive: boolean;
  onClick: () => void;
  sizeClass: string;
  testId: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={isActive}
      data-testid={testId}
      className={cn(
        "relative flex items-center justify-center rounded-md transition-colors cursor-pointer",
        sizeClass,
        isActive
          ? "bg-primary/10 border border-primary/30"
          : "hover:bg-accent text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon size={18} className={isActive ? "text-primary" : ""} aria-hidden />
    </button>
  );
}

interface IconRailProps {
  /** Whether to show mode icons (true in game workspace, false on dashboard). */
  showModes: boolean;
}

export function IconRail({ showModes }: IconRailProps) {
  const navigate = useNavigate();
  const store = useWorkspaceStore();
  const { isDark, toggle: toggleTheme } = useThemeToggle();
  const { active } = useWorkspaceContext();
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const isSettingsActive = store.settingsPanelOpen;
  const isOrgWorkspace = active.type === 'org';
  // Results are reached from Monitor, so Monitor stays marked while they show.
  const activeNavMode = navModeOf(store.mode);

  return (
    <>
      {/* Desktop: vertical left sidebar */}
      <div
        className="operator-rail hidden md:flex w-12 bg-card border-r border-border flex-col items-center py-3 gap-2 shrink-0 z-40"
        data-testid="icon-rail-desktop"
      >
        {/* Stable brand placement; not a control */}
        <BrandMark size={24} className="mb-1" data-testid="rail-brand" />

        {/* Workspace Switcher (includes personal + org buttons + create) */}
        <WorkspaceSwitcher />

        {/* Separator */}
        <div className="w-6 h-px bg-border my-1" />

        {/* Mode icons -- only when showModes is true */}
        {showModes && (
          <nav className="flex flex-col items-center gap-1 flex-1" aria-label={t("workspace.modes.label")}>
            {NAV_MODES.map(({ mode, Icon, labelKey }) => (
              <ModeButton
                key={mode}
                Icon={Icon}
                label={t(labelKey)}
                isActive={activeNavMode === mode}
                onClick={() => store.setMode(mode)}
                sizeClass="w-8 h-8"
                testId={`mode-${mode}`}
              />
            ))}
          </nav>
        )}

        {/* Org nav links -- only when in org workspace and not in game mode */}
        {!showModes && isOrgWorkspace && (
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => navigate("/org/resources")}
              title={t("org.resources", "Resources")}
              aria-label={t("org.resources", "Resources")}
              data-testid="org-resources-btn"
              className="w-8 h-8 flex items-center justify-center rounded-md transition-colors cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <FolderOpen size={18} />
            </button>
            <button
              onClick={() => navigate("/org/members")}
              title={t("org.members", "Members")}
              aria-label={t("org.members", "Members")}
              data-testid="org-members-btn"
              className="w-8 h-8 flex items-center justify-center rounded-md transition-colors cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <Users size={18} />
            </button>
          </div>
        )}

        {/* Spacer when modes are hidden */}
        {!showModes && <div className="flex-1" />}

        {/* Admin panel link -- only for admin users */}
        {user?.role === 'admin' && (
          <button
            onClick={() => navigate('/admin')}
            title={t('admin.title', 'Admin')}
            aria-label={t('admin.title', 'Admin')}
            className="w-8 h-8 flex items-center justify-center rounded-md transition-colors cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <Shield size={18} />
          </button>
        )}

        {/* Dark/light mode toggle */}
        <button
          onClick={toggleTheme}
          title={t(isDark ? "workspace.themeLight" : "workspace.themeDark")}
          aria-label={t(isDark ? "workspace.themeLight" : "workspace.themeDark")}
          data-testid="theme-toggle-btn"
          className="w-8 h-8 flex items-center justify-center rounded-md transition-colors cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* User avatar menu (profile + logout) */}
        <UserAvatarMenu />

        {/* Settings icon at bottom -- only in game workspace */}
        {showModes && (
          <button
            onClick={() => store.toggleSettingsPanel()}
            title={t("workspace.settings")}
            aria-label={t("workspace.settings")}
            aria-pressed={isSettingsActive}
            data-testid="settings-btn"
            className={cn(
              "w-8 h-8 flex items-center justify-center rounded-md transition-colors cursor-pointer",
              isSettingsActive
                ? "bg-primary/10 border border-primary/30"
                : "text-muted-foreground hover:text-foreground hover:bg-accent",
            )}
          >
            <Settings
              size={18}
              className={isSettingsActive ? "text-primary" : ""}
            />
          </button>
        )}
      </div>

      {/* Mobile: bottom tab bar */}
      <div
        className="safe-bottom-nav md:hidden fixed bottom-0 left-0 right-0 grid grid-flow-col auto-cols-fr items-center z-50 bg-card border-t border-border"
        data-testid="icon-rail-mobile"
      >
        {/* Mode icons -- only when showModes is true */}
        {showModes && (
          <>
            {NAV_MODES.map(({ mode, Icon, labelKey }) => (
              <ModeButton
                key={mode}
                Icon={Icon}
                label={t(labelKey)}
                isActive={activeNavMode === mode}
                onClick={() => store.setMode(mode)}
                sizeClass="w-full h-11"
                testId={`mode-${mode}`}
              />
            ))}
          </>
        )}

        {/* General game settings -- available in every game mode */}
        {showModes && (
          <button
            type="button"
            onClick={() => store.toggleSettingsPanel()}
            className={cn(
              "w-full h-11 flex items-center justify-center rounded-md transition-colors cursor-pointer",
              isSettingsActive
                ? "bg-primary/10 border border-primary/30"
                : "text-muted-foreground hover:text-foreground hover:bg-accent",
            )}
            aria-label={t("workspace.settings")}
            aria-pressed={isSettingsActive}
            data-testid="settings-btn"
          >
            <Settings size={20} className={isSettingsActive ? "text-primary" : ""} />
          </button>
        )}

        {/* Combined home/account entry */}
        <UserAvatarMenu className="mx-auto w-11 h-11" showDashboard />
      </div>
    </>
  );
}
