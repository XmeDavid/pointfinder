import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Flag, MapPin, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SurfacePanel } from "@/components/layout/SurfacePanel";
import { LoadingState } from "@/components/feedback/LoadingState";
import { Button } from "@/components/ui/button";
import { useAccountProfile } from "@/features/profile/useAccountProfile";
export function ExplorerProfile() {
  const { t, i18n } = useTranslation(undefined, { keyPrefix: "experience" });
  const query = useAccountProfile();
  const location = useLocation();
  useEffect(() => {
    if (location.hash.startsWith("#game-"))
      document
        .getElementById(location.hash.slice(1))
        ?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [location.hash, query.data?.placements.length]);
  if (query.isPending) return <LoadingState />;
  if (query.isError)
    return (
      <div role="alert">
        {t("connectionError")}
        <Button variant="outline" onClick={() => void query.refetch()}>
          {t("retry")}
        </Button>
      </div>
    );
  const p = query.data,
    progress = Math.max(
      0,
      Math.min(
        100,
        ((p.xp - p.xpForCurrentLevel) /
          Math.max(1, p.xpForNextLevel - p.xpForCurrentLevel)) *
          100,
      ),
    );
  return (
    <div className="ex-profile">
      <SurfacePanel padding="lg">
        <div className="flex flex-wrap justify-between items-end gap-4">
          <div>
            <p className="ex-eyebrow">{t("level", { level: p.level })}</p>
            <p className="mt-3 text-4xl font-semibold tabular-nums">
              {p.xp.toLocaleString(i18n.language)}{" "}
              <span className="text-base text-muted-foreground">XP</span>
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("nextLevel", {
              count: p.xpForNextLevel - p.xp,
              level: p.level + 1,
            })}
          </p>
        </div>
        <div
          className="uh-progress mt-5"
          role="progressbar"
          aria-label={t("levelProgress")}
          aria-valuemin={p.xpForCurrentLevel}
          aria-valuenow={p.xp}
          aria-valuemax={p.xpForNextLevel}
        >
          <div style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          {t("xpDuringPlay")}
        </p>
      </SurfacePanel>
      <div className="ex-profile-stats">
        <div>
          <Flag size={19} />
          <strong>{p.gamesCompleted}</strong>
          <span>{t("gamesCompleted")}</span>
        </div>
        <div>
          <MapPin size={19} />
          <strong>{p.basesCompleted}</strong>
          <span>{t("basesCompleted")}</span>
        </div>
      </div>
      {!!p.placements.length && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("recentJourneys")}</h2>
          {p.placements.map((g, i) => (
            <div
              className="ex-history scroll-mt-6 target:bg-muted target:rounded-lg target:px-3"
              id={g.gameId ? `game-${g.gameId}` : undefined}
              key={`${g.gameId}-${g.endedAt}-${i}`}
            >
              <div>
                <p className="font-semibold">{g.gameName}</p>
                {g.teamName && (
                  <p className="text-sm text-muted-foreground">
                    {t("team", { name: g.teamName })}
                  </p>
                )}
              </div>
              <div className="text-right">
                {g.placement !== null && (
                  <p>
                    {t(g.tied ? "placementTied" : "placement", {
                      place: g.placement,
                      total: g.teams,
                    })}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">+{g.xp} XP</p>
              </div>
            </div>
          ))}
        </section>
      )}
      <p className="mt-5 flex items-start gap-2 text-sm text-muted-foreground">
        <Users size={17} className="shrink-0" />
        {t("sharedProgress")}
      </p>
    </div>
  );
}
