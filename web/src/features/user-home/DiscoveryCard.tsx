import { ArrowUpRight, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  ExploreGameResponse,
  PublicationCategory,
} from "@pointfinder/api";
import { cn } from "@/lib/utils";

const categoryArt: Record<PublicationCategory, string> = {
  coast: "/experience/coastal-trail.webp",
  forest: "/landing/illustrated/forest-footer.webp",
  city: "/landing/topo-terrain-light.webp",
  other: "/landing/illustrated/forest-footer.webp",
};

export function DiscoveryCard({
  game,
  selected,
  onSelect,
}: {
  game: ExploreGameResponse;
  selected?: boolean;
  onSelect: (game: ExploreGameResponse) => void;
}) {
  const { t, i18n } = useTranslation(undefined, { keyPrefix: "experience" });
  return (
    <button
      type="button"
      className={cn("ex-discovery-card", selected && "ex-discovery-selected")}
      onClick={() => onSelect(game)}
      aria-pressed={selected}
    >
      <img
        className="ex-discovery-image"
        src={categoryArt[game.category]}
        alt=""
        loading="lazy"
      />
      <span className="flex justify-between gap-3 items-center text-xs text-muted-foreground">
        <span className="inline-flex gap-1 items-center">
          <MapPin size={14} aria-hidden />
          {game.place}
        </span>
        <ArrowUpRight size={19} aria-hidden />
      </span>
      <span className="block mt-4 text-xl font-semibold leading-snug text-balance">
        {game.title}
      </span>
      <span className="block mt-2 text-sm leading-relaxed text-muted-foreground line-clamp-3">
        {game.summary}
      </span>
      <span className="flex flex-wrap items-center gap-3 mt-5 text-xs text-muted-foreground">
        <span>{t(`category.${game.category}`)}</span>
        <span>
          {t(
            game.gameStatus === "setup"
              ? "upcoming"
              : game.admission === "open"
                ? "openToJoin"
                : "codeRequired",
          )}
        </span>
        {game.distanceKm !== null && (
          <span>
            {t("distance", {
              distance: game.distanceKm.toLocaleString(i18n.language, {
                maximumFractionDigits: 1,
              }),
            })}
          </span>
        )}
      </span>
    </button>
  );
}
