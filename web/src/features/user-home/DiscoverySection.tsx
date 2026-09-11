import { lazy, Suspense, useEffect, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LocateFixed, MapPin, Search, X } from "lucide-react";
import type {
  ExploreGameResponse,
  ExplorePageResponse,
  ExploreQuery,
  PlayerAuthResponse,
} from "@pointfinder/api";
import { useAccountSession, useServices } from "@/app/player/services";
import { getDeviceId } from "@/app/player/device";
import { useAuthStore } from "@/lib/auth/store";
import apiClient from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { LoadingState } from "@/components/feedback/LoadingState";
import { EmptyState } from "@/components/feedback/EmptyState";
import { OverlayPanel } from "@/components/layout/OverlayPanel";
import { GameStatusBadge } from "@/components/status";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { DiscoveryCard } from "./DiscoveryCard";
import { useNearbyGames } from "./useNearbyGames";

const ExperienceMap = lazy(() =>
  import("./ExperienceMap").then((m) => ({ default: m.ExperienceMap })),
);

/** Published games are part of Home, using the account's authenticated session. */
export function DiscoverySection() {
  const { t } = useTranslation(undefined, { keyPrefix: "experience" });
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const session = useAccountSession();
  const services = useServices();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const signedIn = session.kind === "operator" || !!user;
  const identity = session.kind === "operator" ? session.userId : user?.id;
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showMap, setShowMap] = useState(false);
  const [selected, setSelected] = useState<ExploreGameResponse | null>(null);
  const [opening, setOpening] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const nearby = useNearbyGames();
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const params: ExploreQuery = {
    q: search || undefined,
    featured: filter === "featured" || undefined,
    ...(filter === "nearby" && nearby.origin
      ? { lng: nearby.origin[0], lat: nearby.origin[1], radiusKm: 50 }
      : {}),
    size: 20,
  };
  const listings = useInfiniteQuery({
    queryKey: ["account", identity, "explore", params],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      session.kind === "operator"
        ? services.account.api.explore.list({ ...params, page: pageParam })
        : (
            await apiClient.get<ExplorePageResponse>("/explore/games", {
              params: { ...params, page: pageParam },
            })
          ).data,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled: signedIn,
    staleTime: 30_000,
  });
  const games = listings.data?.pages.flatMap((page) => page.items ?? []) ?? [];
  const mappedGame = games.find(
    (game) => game.lng !== null && game.lat !== null,
  );
  const center: [number, number] | undefined =
    filter === "nearby" && nearby.origin
      ? nearby.origin
      : mappedGame
        ? [mappedGame.lng!, mappedGame.lat!]
        : undefined;
  function selectGame(game: ExploreGameResponse) {
    setSelected(game);
    setJoinError(null);
  }
  async function joinGame(game: ExploreGameResponse) {
    setOpening(true);
    setJoinError(null);
    try {
      const request = {
        displayName:
          session.kind === "operator" ? session.userName : (user?.name ?? ""),
        deviceId: await getDeviceId(),
      };
      const response =
        session.kind === "operator"
          ? await services.account.api.explore.join(game.gameId, request)
          : (
              await apiClient.post<PlayerAuthResponse>(
                `/explore/games/${game.gameId}/join`,
                request,
              )
            ).data;
      await services.client.session.setPlayer(response);
      await queryClient.invalidateQueries({ queryKey: ["account", identity] });
      navigate("/map");
    } catch (error) {
      const failure = error as {
        code?: string;
        status?: number;
        response?: { status?: number; data?: { code?: string } };
      };
      const code = failure.response?.data?.code ?? failure.code;
      setJoinError(
        code === "DEVICE_ALREADY_IN_DIFFERENT_TEAM"
          ? "discoveryOtherTeam"
          : code === "PUBLICATION_ADMISSION_CLOSED" ||
              (failure.status ?? failure.response?.status) === 404
            ? "admissionClosed"
            : "discoveryJoinError",
      );
      void listings.refetch();
    } finally {
      setOpening(false);
    }
  }
  return (
    <div
      className={`ex-discovery-home ${showMap ? "ex-discovery-with-map" : ""}`}
    >
      <section className="ex-discovery-list">
        <div className="ex-section-heading">
          <div>
            <p className="ex-eyebrow">{t("outThere")}</p>
            <h2>{t("nextDiscovery")}</h2>
          </div>
          {signedIn && (
            <Button
              variant="ghost"
              className="gap-2"
              aria-pressed={showMap}
              onClick={() => setShowMap(!showMap)}
            >
              <MapPin size={16} aria-hidden />
              {t(showMap ? "hideMap" : "showMap")}
            </Button>
          )}
        </div>
        {!signedIn ? (
          <EmptyState
            title={t("discoverAccount")}
            description={t("discoverAccountHint")}
            action={
              <Button onClick={() => navigate("/account")}>
                {t("saveProgress")}
              </Button>
            }
          />
        ) : (
          <>
            <label className="ex-search">
              <Search size={17} aria-hidden />
              <span className="sr-only">{t("search")}</span>
              <input
                placeholder={t("search")}
                value={query}
                maxLength={100}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button aria-label={t("clear")} onClick={() => setQuery("")}>
                  <X size={16} />
                </button>
              )}
            </label>
            <div className="ex-filter-row">
              {["all", "featured", "nearby"].map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={filter === value ? "default" : "outline"}
                  aria-pressed={filter === value}
                  onClick={() => {
                    setFilter(value);
                    if (value === "nearby" && !nearby.origin)
                      void nearby.locate();
                  }}
                >
                  {value === "nearby" && (
                    <LocateFixed size={14} className="mr-1.5" aria-hidden />
                  )}
                  {t(value)}
                </Button>
              ))}
            </div>
            {filter === "nearby" && (
              <p role="status" className="text-xs text-muted-foreground mt-4">
                {t(`location.${nearby.status}`)}
              </p>
            )}
            {showMap && (
              <section
                className="ex-discovery-map"
                aria-label={t("discoveryMap")}
              >
                <Suspense fallback={<LoadingState />}>
                  <ExperienceMap
                    games={games}
                    selectedId={selected?.gameId}
                    onSelect={selectGame}
                    center={center}
                    zoom={10}
                  />
                </Suspense>
                <div className="ex-map-caption">
                  <OverlayPanel padding="sm">
                    <p className="text-xs">{t("mapHint")}</p>
                  </OverlayPanel>
                </div>
              </section>
            )}
            {!online && (
              <p role="status" className="mt-4 text-sm text-muted-foreground">
                {t("discoveryOffline")}
              </p>
            )}
            <div
              className="ex-discovery-grid mt-6"
              aria-busy={listings.isFetching}
            >
              {listings.isPending ? (
                online ? (
                  <LoadingState />
                ) : null
              ) : listings.isError && !games.length ? (
                <div role="alert">
                  <p>{t("connectionError")}</p>
                  <Button
                    variant="outline"
                    className="mt-3"
                    onClick={() => void listings.refetch()}
                  >
                    {t("retry")}
                  </Button>
                </div>
              ) : games.length ? (
                games.map((game) => (
                  <DiscoveryCard
                    key={game.gameId}
                    game={game}
                    selected={selected?.gameId === game.gameId}
                    onSelect={selectGame}
                  />
                ))
              ) : (
                <EmptyState
                  title={t("noGames")}
                  description={t("noGamesHint")}
                  action={
                    <Button
                      variant="outline"
                      onClick={() => {
                        setQuery("");
                        setFilter("all");
                      }}
                    >
                      {t("showAll")}
                    </Button>
                  }
                />
              )}
            </div>
            {listings.isError && !!games.length && (
              <p role="alert" className="mt-3 text-sm">
                {t("discoveryStale")}{" "}
                <Button variant="ghost" onClick={() => void listings.refetch()}>
                  {t("retry")}
                </Button>
              </p>
            )}
            {listings.hasNextPage && (
              <Button
                variant="outline"
                className="mt-6"
                disabled={listings.isFetchingNextPage}
                onClick={() => void listings.fetchNextPage()}
              >
                {t("moreGames")}
              </Button>
            )}
          </>
        )}
      </section>
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open && !opening) setSelected(null);
        }}
      >
        <DialogContent
          onClose={() => {
            if (!opening) setSelected(null);
          }}
        >
          {selected && (
            <>
              <p className="ex-eyebrow">{selected.place}</p>
              <DialogTitle className="text-2xl mt-2 break-words">
                {selected.title}
              </DialogTitle>
              <div className="mt-4">
                <GameStatusBadge status={selected.gameStatus} />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mt-4 whitespace-pre-line break-words">
                {selected.summary}
              </p>
              <p className="text-sm text-muted-foreground mt-3">
                {selected.organizer}
              </p>
              <p className="text-sm mt-5">
                {t(
                  selected.joined
                    ? "alreadyPlaying"
                    : selected.gameStatus === "setup"
                      ? "upcomingHint"
                      : selected.joinable
                        ? "openToJoinHint"
                        : "codeRequiredHint",
                )}
              </p>
              {!online && (
                <p role="status" className="mt-3 text-sm">
                  {t("discoveryOffline")}
                </p>
              )}
              {joinError && (
                <p role="alert" className="text-sm text-destructive mt-3">
                  {t(joinError)}
                </p>
              )}
              {selected.joined || selected.joinable ? (
                <Button
                  className="w-full mt-5"
                  disabled={opening || !online}
                  onClick={() => void joinGame(selected)}
                >
                  {t(selected.joined ? "continue" : "startExploring")}
                </Button>
              ) : (
                selected.gameStatus === "live" && (
                  <Button
                    className="w-full mt-5"
                    onClick={() => navigate("/join")}
                  >
                    {t("joinCode")}
                  </Button>
                )
              )}
              <Button
                className="w-full mt-3"
                variant="outline"
                disabled={opening}
                onClick={() => setSelected(null)}
              >
                {t("backToDiscoveries")}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
