import { useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Hammer,
  Zap,
  ClipboardList,
  Trophy,
  Settings,
  FolderOpen,
  Shield,
} from "lucide-react";
import {
  useWorkspaceStore,
  type GameMode,
} from "@/stores/workspace";
import { cn } from "@/lib/utils";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { useWorkspaceContext } from "@/stores/workspaceContext";
import { useAuthStore } from "@/lib/auth/store";
import { UserAvatarMenu } from "./UserAvatarMenu";

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

const modeIcons: Array<{
  mode: GameMode;
  Icon: typeof Hammer;
  label: string;
}> = [
  { mode: "build", Icon: Hammer, label: "Build" },
  { mode: "command", Icon: Zap, label: "Command" },
  { mode: "review", Icon: ClipboardList, label: "Review" },
  { mode: "results", Icon: Trophy, label: "Results" },
];

function ModeButton({
  Icon,
  label,
  isActive,
  onClick,
  sizeClass,
}: {
  Icon: typeof Hammer;
  label: string;
  isActive: boolean;
  onClick: () => void;
  sizeClass: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "relative flex items-center justify-center rounded-md transition-colors cursor-pointer",
        sizeClass,
        isActive
          ? "bg-primary/10 border border-primary/30"
          : "hover:bg-accent text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon size={18} className={isActive ? "text-primary" : ""} />
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

  return (
    <>
      {/* Desktop: vertical left sidebar */}
      <div
        className="hidden md:flex w-12 bg-card border-r border-border flex-col items-center py-3 gap-2 shrink-0 z-40"
        data-testid="icon-rail-desktop"
      >
        {/* Workspace Switcher (includes personal + org buttons + create) */}
        <WorkspaceSwitcher />

        {/* Separator */}
        <div className="w-6 h-px bg-border my-1" />

        {/* Mode icons -- only when showModes is true */}
        {showModes && (
          <div className="flex flex-col items-center gap-1 flex-1">
            {modeIcons.map(({ mode, Icon, label }) => (
              <ModeButton
                key={mode}
                Icon={Icon}
                label={label}
                isActive={store.mode === mode}
                onClick={() => store.setMode(mode)}
                sizeClass="w-8 h-8"
              />
            ))}
          </div>
        )}

        {/* Org nav links -- only when in org workspace and not in game mode */}
        {!showModes && isOrgWorkspace && (
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => navigate("/org/resources")}
              title="Resources"
              aria-label="Resources"
              className="w-8 h-8 flex items-center justify-center rounded-md transition-colors cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <FolderOpen size={18} />
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

        {/* User avatar menu (profile, theme, language, logout) */}
        <UserAvatarMenu isDark={isDark} onToggleTheme={toggleTheme} />

        {/* Settings icon at bottom -- only in game workspace */}
        {showModes && (
          <button
            onClick={() => store.toggleSettingsPanel()}
            title="Settings"
            aria-label="Settings"
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
        className="md:hidden fixed bottom-0 left-0 right-0 flex flex-row items-center justify-center h-14 z-50 bg-card border-t border-border gap-3 px-4"
        data-testid="icon-rail-mobile"
      >
        {/* PF Logo */}
        <button
          onClick={() => navigate("/dashboard")}
          className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs shrink-0 hover:opacity-90 transition-opacity cursor-pointer"
          aria-label="Dashboard"
        >
          PF
        </button>

        {/* Mode icons -- only when showModes is true */}
        {showModes && (
          <>
            {/* Separator */}
            <div className="h-6 w-px bg-border" />

            {modeIcons.map(({ mode, Icon, label }) => (
              <ModeButton
                key={mode}
                Icon={Icon}
                label={label}
                isActive={store.mode === mode}
                onClick={() => store.setMode(mode)}
                sizeClass="w-10 h-10"
              />
            ))}
          </>
        )}

        {/* Push remaining icons to the right */}
        <div className="flex-1" />

        {/* User avatar menu (profile, theme, language, logout) */}
        <UserAvatarMenu isDark={isDark} onToggleTheme={toggleTheme} />
      </div>
    </>
  );
}
