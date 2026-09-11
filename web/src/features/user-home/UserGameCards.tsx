import { useTranslation } from "react-i18next";
import { ArrowRight, ChevronRight, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SurfacePanel } from "@/components/layout/SurfacePanel";
import { StatusBadge } from "@/components/status/StatusBadge";
export type UserGame = {
  context: "player" | "operator";
  id: string;
  name: string;
  place: string;
  team?: string;
  status: "live" | "setup" | "ended";
  done?: number;
  total?: number;
};
export function UserGameStatus({ game }: { game: UserGame }) {
  const { t } = useTranslation(undefined, { keyPrefix: "userHome" });
  return (
    <StatusBadge
      label={t(`status.${game.status}`)}
      tone={
        game.status === "live"
          ? "success"
          : game.status === "setup"
            ? "info"
            : "muted"
      }
    />
  );
}
export function UserGameRow({
  game,
  onOpen,
}: {
  game: UserGame;
  onOpen: (game: UserGame) => void;
}) {
  const { t } = useTranslation(undefined, { keyPrefix: "userHome" });
  return (
    <button key={game.id} className="uh-game-row" onClick={() => onOpen(game)}>
      <span className="uh-row-icon">
        <MapPin size={20} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block font-semibold break-words">{game.name}</span>
        <span className="block text-sm text-muted-foreground mt-1">
          {game.team ? t("team", { name: game.team }) : game.place}
        </span>
      </span>
      <UserGameStatus game={game} />
      <ChevronRight
        size={18}
        className="shrink-0 text-muted-foreground"
        aria-hidden
      />
    </button>
  );
}
export function ParticipationCard({
  game,
  onOpen,
}: {
  game: UserGame;
  onOpen: (game: UserGame) => void;
}) {
  const { t } = useTranslation(undefined, { keyPrefix: "userHome" });
  return (
    <SurfacePanel padding="none" className="uh-resume">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="uh-eyebrow">{t("yourGame")}</span>
        <UserGameStatus game={game} />
      </div>
      <div className="my-8">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin size={15} aria-hidden />
          {game.place}
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance">
          {game.name}
        </h2>
        <p className="mt-3 flex items-center gap-2 text-sm">
          <Users size={16} aria-hidden />
          {t("team", { name: game.team })}
        </p>
      </div>
      {game.done !== undefined && game.total !== undefined && (
        <div className="mb-7">
          <div className="flex flex-wrap justify-between gap-2 text-sm mb-3">
            <span>{t("teamProgress")}</span>
            <strong>
              {t("progress", { count: game.done, total: game.total })}
            </strong>
          </div>
          <div
            className="uh-progress"
            role="progressbar"
            aria-label={t("teamProgress")}
            aria-valuenow={game.done}
            aria-valuemin={0}
            aria-valuemax={game.total}
          >
            <div
              style={{
                width: `${game.total ? ((game.done ?? 0) / game.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}
      <Button
        size="lg"
        className="w-full sm:w-auto gap-3"
        onClick={() => onOpen(game)}
      >
        {t("continue")}
        <ArrowRight size={17} aria-hidden />
      </Button>
    </SurfacePanel>
  );
}
