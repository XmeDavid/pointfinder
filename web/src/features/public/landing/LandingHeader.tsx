import { Menu, Moon, Sun, X } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BrandMark } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setThemePreference } from "@/lib/theme";

export type LandingSection = { id: string; label: string };

type LandingHeaderProps = {
  sections: LandingSection[];
  getStartedHref: string;
};

const MENU_BREAKPOINT = "(min-width: 768px)";

/** Sticky evergreen website header: section links, language, theme, login and the primary call to action. */
export function LandingHeader({ sections, getStartedHref }: LandingHeaderProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) toggleRef.current?.focus();
  }, []);

  // Escape closes the menu and returns focus to the button that opened it.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  // Move focus into the menu when it opens so keyboard users land on the first link.
  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLElement>("a, button, select");
    first?.focus();
  }, [open]);

  // The desktop nav takes over past the breakpoint; do not leave a stale open panel behind.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(MENU_BREAKPOINT);
    const onChange = () => {
      if (media.matches) setOpen(false);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return (
    <header className="landing-header landing-dark sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="PointFinder"
          onClick={() => close()}
        >
          <BrandMark size={28} tone="current" decorative />
          <span className="truncate text-base font-semibold tracking-tight">PointFinder</span>
        </Link>

        <nav aria-label={t("landing.nav.primary")} className="hidden items-center gap-1 md:flex">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {section.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="hidden items-center gap-1.5 md:flex">
            <LanguageSelect />
            <ThemeToggle />
          </div>
          <Link
            to="/login"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}
          >
            {t("landing.nav.operatorLogin")}
          </Link>
          <Link to={getStartedHref} className={cn(buttonVariants({ size: "sm" }))}>
            {t("landing.nav.getStarted")}
          </Link>
          <button
            ref={toggleRef}
            type="button"
            className={cn(buttonVariants({ variant: "outline", size: "icon" }), "h-9 w-9 md:hidden")}
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? t("landing.nav.closeMenu") : t("landing.nav.openMenu")}
            data-testid="landing-menu-toggle"
            onClick={() => (open ? close(true) : setOpen(true))}
          >
            {open ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div
        id={menuId}
        ref={menuRef}
        hidden={!open}
        data-testid="landing-menu"
        className="border-t border-border/60 bg-background md:hidden"
      >
        <nav aria-label={t("landing.nav.primary")} className="mx-auto flex max-w-6xl flex-col px-4 py-3 sm:px-6">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-md px-2 py-3 text-base font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => close()}
            >
              {section.label}
            </a>
          ))}
          <Link
            to="/login"
            className="rounded-md px-2 py-3 text-base font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
            onClick={() => close()}
          >
            {t("landing.nav.operatorLogin")}
          </Link>
          <Link to={getStartedHref} className={cn(buttonVariants({ size: "lg" }), "mt-2 w-full")} onClick={() => close()}>
            {t("landing.nav.getStarted")}
          </Link>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
            <LanguageSelect />
            <ThemeToggle />
          </div>
        </nav>
      </div>
    </header>
  );
}

/** Language picker shared by the header and the footer; the choice persists through i18next's cache. */
export function LanguageSelect({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const language = (i18n.resolvedLanguage ?? i18n.language ?? "en").slice(0, 2);
  return (
    <label className={cn("flex min-w-0 items-center gap-2 text-sm", className)}>
      <span className="sr-only">{t("landing.nav.language")}</span>
      <select
        aria-label={t("landing.nav.language")}
        data-testid="landing-language"
        value={language}
        onChange={(event) => void i18n.changeLanguage(event.target.value)}
        className="h-9 max-w-full rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="en" lang="en">English</option>
        <option value="pt" lang="pt">Português</option>
        <option value="de" lang="de">Deutsch</option>
      </select>
    </label>
  );
}

function readDark() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

/** Switches the whole site between the light and dark theme; the choice is the same one the app uses. */
export function ThemeToggle({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const [dark, setDark] = useState(readDark);

  // Other tabs and the system preference can flip the theme underneath us.
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(readDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const label = dark ? t("landing.nav.themeToLight") : t("landing.nav.themeToDark");
  return (
    <button
      type="button"
      className={cn(buttonVariants({ variant: "outline", size: "icon" }), "h-9 w-9")}
      aria-label={label}
      title={label}
      data-testid="landing-theme-toggle"
      onClick={() => {
        setThemePreference(dark ? "light" : "dark");
        setDark(readDark());
      }}
    >
      {dark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
      {children}
    </button>
  );
}
