import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  FolderOpen,
  House,
  MapPin,
  Moon,
  Plus,
  Sun,
  UserRound,
  Users,
  FileText,
} from "lucide-react";
import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { SurfacePanel } from "@/components/layout/SurfacePanel";
import { GameStatusBadge } from "@/components/status";
import { EmptyState } from "@/components/feedback/EmptyState";
import { BillingWarningBanner } from "@/components/feedback/BillingWarningBanner";
import { FrozenBlocker } from "@/components/feedback/FrozenBlocker";
import { setThemePreference } from "@/lib/theme";
import { useLocalDesign, localDesign } from "../user-home/useLocalDesign";
import { PlayingGames } from "../user-home/PlayingGames";
import { useAuth, useAccountSession } from "@/app/player/services";
import { OrganizePanel } from "./OrganizePanel";
import { WelcomeCard } from "@/features/tutorials/WelcomeCard";
import { useGames } from "@/hooks/queries/useGames";
import { useAccountProfile } from "@/features/profile/useAccountProfile";
import { useAuthStore } from "@/lib/auth/store";
import { DiscoverySection } from "../user-home/DiscoverySection";
import "../user-home/user-home.css";
import "../user-home/experience.css";

const destinations = [
  { path: "/dashboard", key: "home", icon: House },
  { path: "/explore", key: "explore", icon: MapPin },
  { path: "/dashboard?view=play", key: "play", icon: MapPin },
  { path: "/dashboard?view=organize", key: "organize", icon: FolderOpen },
  { path: "/profile", key: "profile", icon: UserRound },
] as const;
/** One account home for discovering, playing and organizing. */
export function DashboardPage() {
  const { t } = useTranslation(undefined, { keyPrefix: "experience" });
  const location = useLocation();
  const navigate = useNavigate();
  const page = new URLSearchParams(location.search).get("view") ?? "home";
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  const [past, setPast] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const local = useLocalDesign();
  const player = useAuth();
  const profile = useAccountProfile();
  const user = useAuthStore((s) => s.user);
  const account = useAccountSession();
  const signedIn = !!user || account.kind === "operator";
  const canOrganize = !!user && user.role !== "participant";
  const displayName =
    user?.name ??
    (account.kind === "operator"
      ? account.userName
      : player.kind === "player"
        ? player.displayName
        : "");
  const activeName =
    local.activeName ??
    (player.kind === "player"
      ? player.gameName
      : (local.data?.[0]?.name ?? ""));
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState(false);
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains("dark")),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    mainRef.current?.querySelector("h1")?.focus();
  }, [location.pathname, location.search]);
  async function openCurrentGame() {
    if (player.kind === "player") {
      navigate("/");
      return;
    }
    const actual = local.data?.[0];
    if (!actual) return;
    setOpening(true);
    setOpenError(false);
    try {
      await local.enterGame(actual);
      navigate("/");
    } catch {
      setOpenError(true);
    } finally {
      setOpening(false);
    }
  }
  return (
    <div className="ex-app" data-testid="user-experience">
      <header className="ex-header safe-gutter">
        <Link to="/dashboard" aria-label="PointFinder" className="ex-brand">
          <BrandLockup size={32} textClassName="text-lg" />
        </Link>
        <nav className="ex-desktop-nav" aria-label={t("navigation")}>
          {destinations
            .filter(
              (d) =>
                d.key !== "profile" &&
                d.key !== "explore" &&
                (d.key !== "organize" || canOrganize || localDesign),
            )
            .map(({ path, key, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                className={page === key ? "active" : ""}
                aria-current={page === key ? "page" : undefined}
              >
                <Icon size={17} aria-hidden />
                {t(`nav.${key}`)}
              </Link>
            ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            aria-label={t(dark ? "light" : "dark")}
            onClick={() => setThemePreference(dark ? "light" : "dark")}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </Button>
          <Link
            to={signedIn ? "/profile" : "/account"}
            className="ex-profile-link"
            aria-label={t("yourProfile")}
          >
            <span className="uh-avatar">
              {displayName
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("") || "PF"}
            </span>
            <span className="hidden lg:block text-sm">
              {t("level", { level: profile.data?.level ?? 0 })}
            </span>
          </Link>
        </div>
      </header>
      {/* Operators still see billing problems on the page they land on. */}
      <BillingWarningBanner />
      {(openError || (localDesign && local.isError)) && (
        <div role="alert" className="p-4 text-destructive">
          {t("connectionError")}
          <Button
            variant="outline"
            className="ml-3"
            onClick={() => {
              setOpenError(false);
              void local.refetch();
            }}
          >
            {t("retry")}
          </Button>
        </div>
      )}
      <main
        ref={mainRef}
        className={page === "explore" ? "ex-explore-main" : "ex-main"}
      >
        {page === "home" && (
          <>
            {user && <FirstGameOffer />}
            <div className="ex-heading ex-heading-join">
              <div>
                <p className="ex-eyebrow">
                  {t("welcome", { name: displayName.split(" ")[0] })}
                </p>
                <h1 tabIndex={-1}>{t("homeTitle")}</h1>
              </div>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() =>
                  navigate(
                    !signedIn && player.kind === "player"
                      ? "/account"
                      : "/join",
                  )
                }
              >
                <Plus size={17} aria-hidden />
                {t(
                  !signedIn && player.kind === "player"
                    ? "saveProgress"
                    : "joinCode",
                )}
              </Button>
            </div>
            {(localDesign || player.kind === "player") && (
              <section
                className="ex-current-game"
                aria-label={t("ongoingGame")}
              >
                <SurfacePanel padding="none" className="ex-resume-card">
                  <div className="flex items-center justify-between gap-3">
                    <span className="ex-eyebrow">{t("ongoingGame")}</span>
                    <GameStatusBadge
                      status={
                        local.status ??
                        (player.kind === "player" ? player.gameStatus : "live")
                      }
                    />
                  </div>
                  <h2 className="mt-5 text-3xl font-semibold leading-tight text-balance">
                    {activeName}
                  </h2>
                  <p className="flex gap-2 items-center text-sm mt-3 text-muted-foreground">
                    <Users size={16} aria-hidden />
                    {t("team", {
                      name:
                        local.teamName ??
                        (player.kind === "player"
                          ? player.teamName
                          : "Falcons"),
                    })}
                  </p>
                  {local.hasProgress && (
                    <>
                      <div className="flex justify-between gap-3 text-sm mt-7 mb-3">
                        <span>{t("visibleProgress")}</span>
                        <strong>
                          {local.done} / {local.total}
                        </strong>
                      </div>
                      <div
                        className="uh-progress"
                        role="progressbar"
                        aria-label={t("visibleProgress")}
                        aria-valuenow={local.done}
                        aria-valuemin={0}
                        aria-valuemax={local.total}
                      >
                        <div
                          style={{
                            width: `${(local.done / Math.max(1, local.total)) * 100}%`,
                          }}
                        />
                      </div>
                    </>
                  )}
                  <Button
                    size="lg"
                    className="w-full gap-3 mt-6"
                    onClick={() => void openCurrentGame()}
                    disabled={opening || (localDesign && !local.data)}
                  >
                    {t("continue")}
                    <ArrowRight size={17} aria-hidden />
                  </Button>
                  {player.kind === "player" && (
                    <Link
                      to="/documents"
                      className="mt-3 flex min-h-11 items-center justify-center gap-2 text-sm font-medium"
                    >
                      <FileText size={17} />
                      {t("gameDocuments")}
                    </Link>
                  )}
                </SurfacePanel>
              </section>
            )}
          </>
        )}
        {(page === "explore" || page === "home") && <DiscoverySection />}
        {page === "play" && (
          <>
            <div className="ex-heading ex-heading-join">
              <div>
                <p className="ex-eyebrow">{t("yourJourneys")}</p>
                <h1 tabIndex={-1}>{t("nav.play")}</h1>
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  navigate(
                    !signedIn && player.kind === "player"
                      ? "/account"
                      : "/join",
                  )
                }
              >
                {t(
                  !signedIn && player.kind === "player"
                    ? "saveProgress"
                    : "joinCode",
                )}
              </Button>
            </div>
            <div className="uh-tabs">
              {[false, true].map((value) => (
                <button
                  key={String(value)}
                  aria-pressed={past === value}
                  className={value === past ? "uh-tab-active" : ""}
                  onClick={() => setPast(value)}
                >
                  {t(value ? "ended" : "current")}
                </button>
              ))}
            </div>
            <PlayingGames past={past} />
          </>
        )}
        {page === "organize" &&
          (canOrganize ? (
            <FrozenBlocker>
              <OrganizePanel />
            </FrozenBlocker>
          ) : (
            <EmptyState
              title={t("organizerAccess")}
              description={t("organizerAccessHint")}
              action={
                <Button onClick={() => navigate("/login")}>
                  {t("organizerSignIn")}
                </Button>
              }
            />
          ))}
      </main>
      <nav
        className="ex-mobile-nav safe-bottom-nav"
        aria-label={t("navigation")}
      >
        {destinations
          .filter(
            (d) =>
              d.key !== "profile" &&
              d.key !== "explore" &&
              (d.key !== "organize" || canOrganize || localDesign),
          )
          .map(({ path, key, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              className={page === key ? "active" : ""}
              aria-current={page === key ? "page" : undefined}
            >
              <Icon size={20} aria-hidden />
              <span>{t(`nav.${key}`)}</span>
            </Link>
          ))}
      </nav>
    </div>
  );
}

/** The guided first game is offered on the home too, so a new organizer does not have to find the organize view first. */
function FirstGameOffer() {
  const { data: games } = useGames();
  return <WelcomeCard games={games} />;
}
