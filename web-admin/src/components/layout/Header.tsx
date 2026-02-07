import { Moon, Sun, LogOut, User, ChevronRight, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/hooks/useAuth";
import { useThemeStore } from "@/hooks/useTheme";
import { Link, useMatches } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface BreadcrumbItem {
  label: string;
  path?: string;
}

function useBreadcrumbs(): BreadcrumbItem[] {
  const matches = useMatches();
  const { t } = useTranslation();
  const crumbs: BreadcrumbItem[] = [];

  const breadcrumbMap: Record<string, string> = {
    Home: t("common.appName"),
    Games: t("nav.games"),
    "New Game": t("games.newGame"),
    Admin: "Admin",
    Operators: t("nav.operators"),
    Overview: t("nav.overview"),
    Bases: t("nav.bases"),
    Challenges: t("nav.challenges"),
    Assignments: t("nav.assignments"),
    Teams: t("nav.teams"),
    Notifications: t("nav.notifications"),
    Monitor: t("nav.monitor"),
    Map: t("nav.map"),
    Leaderboard: t("nav.leaderboard"),
    Activity: t("nav.activity"),
    Submissions: t("nav.submissions"),
    "Team Detail": t("nav.teams"),
    Results: t("results.title"),
  };

  for (const match of matches) {
    const handle = match.handle as { breadcrumb?: string } | undefined;
    if (handle?.breadcrumb) {
      crumbs.push({
        label: breadcrumbMap[handle.breadcrumb] ?? handle.breadcrumb,
        path: match.pathname,
      });
    }
  }

  return crumbs;
}

export function Header() {
  const { user, logout } = useAuthStore();
  const { dark, toggle } = useThemeStore();
  const crumbs = useBreadcrumbs();
  const { t, i18n } = useTranslation();

  const currentLang = i18n.language?.startsWith("pt") ? "pt" : "en";

  function toggleLanguage() {
    const next = currentLang === "en" ? "pt" : "en";
    i18n.changeLanguage(next);
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 backdrop-blur px-6">
      <nav className="flex items-center gap-1 text-sm">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            {crumb.path && i < crumbs.length - 1 ? (
              <Link to={crumb.path} className="text-muted-foreground hover:text-foreground transition-colors">
                {crumb.label}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={toggleLanguage} className="gap-1.5 text-xs font-medium">
          <Globe className="h-4 w-4" />
          {currentLang.toUpperCase()}
        </Button>

        <Button variant="ghost" size="icon" onClick={toggle}>
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent transition-colors">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
              {user?.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-medium hidden sm:block">{user?.name}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <div className="px-2 py-1.5 text-sm">
              <p className="font-medium">{user?.name}</p>
              <p className="text-muted-foreground text-xs">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              {t("common.profile")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} destructive>
              <LogOut className="mr-2 h-4 w-4" />
              {t("common.logOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
