import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Radio, Eye, EyeOff, Users, User } from "lucide-react";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Map as MapGL, Marker, Source, Layer } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/common/Spinner";
import { basesApi } from "@/lib/api/bases";
import { teamsApi } from "@/lib/api/teams";
import { challengesApi } from "@/lib/api/challenges";
import { monitoringApi } from "@/lib/api/monitoring";
import { gamesApi } from "@/lib/api/games";
import { Alert } from "@/components/ui/alert";
import { useTranslation } from "react-i18next";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { formatDateTime } from "@/lib/utils";
import { STATUS_COLORS, getAggregateStatus as getAggregateStatusUtil, parseTimestamp, computeBounds } from "@/lib/map-utils";
import { PinMarkerSvg, CircleDot } from "@/components/common/MapMarkers";
import { getResolvedStyleUrl, getDefaultCenter } from "@/lib/tile-sources";
import { useThemeStore } from "@/hooks/useTheme";
import type { BaseStatus, TeamLocation } from "@/types";
import type { MapRef } from "react-map-gl/maplibre";

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function StatusBadge({ status }: { status: BaseStatus }) {
  const { t } = useTranslation();

  const labels: Record<BaseStatus, string> = {
    not_visited: t("mapPage.notVisited"),
    checked_in: t("mapPage.checkedIn"),
    submitted: t("mapPage.submitted"),
    completed: t("mapPage.completed"),
    rejected: t("common.rejected"),
  };

  const classes: Record<BaseStatus, string> = {
    not_visited: "bg-gray-100 text-gray-600 border-gray-200",
    checked_in: "bg-blue-50 text-blue-700 border-blue-200",
    submitted: "bg-amber-50 text-amber-700 border-amber-200",
    completed: "bg-green-50 text-green-700 border-green-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border ${classes[status]}`}>
      {labels[status]}
    </span>
  );
}

export function MapPage() {
  const { t } = useTranslation();
  const { dark } = useThemeStore();
  const { gameId } = useParams<{ gameId: string }>();
  const mapRef = useRef<MapRef>(null);
  const fittedRef = useRef(false);

  const gameQuery = useQuery({ queryKey: ["game", gameId], queryFn: () => gamesApi.getById(gameId!) });
  const basesQuery = useQuery({ queryKey: ["bases", gameId], queryFn: () => basesApi.listByGame(gameId!) });
  const teamsQuery = useQuery({ queryKey: ["teams", gameId], queryFn: () => teamsApi.listByGame(gameId!) });
  const challengesQuery = useQuery({ queryKey: ["challenges", gameId], queryFn: () => challengesApi.listByGame(gameId!) });
  const progressQuery = useQuery({ queryKey: ["progress", gameId], queryFn: () => monitoringApi.getProgress(gameId!) });
  const websocketError = useGameWebSocket(gameId);
  const locationsQuery = useQuery({
    queryKey: ["team-locations", gameId],
    queryFn: () => monitoringApi.getTeamLocations(gameId!),
  });

  const game = gameQuery.data;
  const bases = useMemo(() => basesQuery.data ?? [], [basesQuery.data]);
  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);
  const challenges = useMemo(() => challengesQuery.data ?? [], [challengesQuery.data]);
  const progress = useMemo(() => progressQuery.data ?? [], [progressQuery.data]);
  const locations = useMemo(() => locationsQuery.data ?? [], [locationsQuery.data]);
  const locationsUpdatedAt = locationsQuery.dataUpdatedAt;

  const isLoading = basesQuery.isLoading || teamsQuery.isLoading || challengesQuery.isLoading || progressQuery.isLoading || locationsQuery.isLoading;
  const isError = basesQuery.isError || teamsQuery.isError || challengesQuery.isError || progressQuery.isError || locationsQuery.isError;
  const hasData = basesQuery.data !== undefined || teamsQuery.data !== undefined;

  const [showBases, setShowBases] = useState(true);
  const [showTeams, setShowTeams] = useState(true);
  // "all" = default aggregate view, string = teamId for team-specific view
  const [viewMode, setViewMode] = useState<"all" | string>("all");
  const [popupBase, setPopupBase] = useState<string | null>(null);
  const [popupLoc, setPopupLoc] = useState<string | null>(null);

  const challengeMap = useMemo(() => {
    const map = new Map<string, { title: string; description: string; points: number }>();
    challenges.forEach((c) => map.set(c.id, { title: c.title, description: c.description, points: c.points }));
    return map;
  }, [challenges]);

  const teamMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    teams.forEach((t) => map.set(t.id, { name: t.name, color: t.color }));
    return map;
  }, [teams]);

  // Index progress: baseId -> teamId -> status info
  const progressIndex = useMemo(() => {
    const idx = new Map<string, Map<string, { status: BaseStatus; challengeId?: string }>>();
    progress.forEach((p) => {
      if (!idx.has(p.baseId)) idx.set(p.baseId, new Map());
      idx.get(p.baseId)!.set(p.teamId, { status: p.status, challengeId: p.challengeId });
    });
    return idx;
  }, [progress]);

  // Use query refresh timestamp so stale detection updates whenever locations refetch.
  const now = locationsUpdatedAt;

  // Get user's current location or fallback to tile source default center
  const tileSourceCenter = getDefaultCenter(game?.tileSource);
  const [geoLocation, setGeoLocation] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (bases.length === 0 && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGeoLocation([position.coords.latitude, position.coords.longitude]);
        },
        () => {
          // Geolocation failed, tile source default will be used
        }
      );
    }
  }, [bases.length]);

  const userLocation: [number, number] = useMemo(() => geoLocation ?? [tileSourceCenter.lat, tileSourceCenter.lng], [geoLocation, tileSourceCenter.lat, tileSourceCenter.lng]);

  // Fit bounds when bases first load
  useEffect(() => {
    if (bases.length > 0 && mapRef.current && !fittedRef.current) {
      const bounds = computeBounds(bases);
      if (bounds) {
        mapRef.current.fitBounds(bounds, { padding: 40, maxZoom: 16 });
        fittedRef.current = true;
      }
    }
  }, [bases]);

  // Default center
  const defaultCenter: { lng: number; lat: number } = useMemo(() =>
    bases.length > 0
      ? { lat: bases.reduce((s, b) => s + b.lat, 0) / bases.length, lng: bases.reduce((s, b) => s + b.lng, 0) / bases.length }
      : { lat: userLocation[0], lng: userLocation[1] },
    [bases, userLocation]
  );

  // Compute aggregate status for a base (lowest common denominator across all teams)
  const getAggregateStatus = useCallback(
    (baseId: string): BaseStatus => getAggregateStatusUtil(baseId, progressIndex),
    [progressIndex]
  );

  // Get pin color for a base
  const getBaseColor = useCallback(
    (baseId: string): string => {
      if (viewMode === "all") {
        return STATUS_COLORS[getAggregateStatus(baseId)];
      }
      const teamProgress = progressIndex.get(baseId)?.get(viewMode);
      return STATUS_COLORS[teamProgress?.status ?? "not_visited"];
    },
    [viewMode, getAggregateStatus, progressIndex]
  );

  // Pre-index locations by teamId for O(1) lookup
  const locationsByTeam = useMemo(() => {
    const map = new Map<string, TeamLocation[]>();
    locations.forEach((loc) => {
      const arr = map.get(loc.teamId) ?? [];
      arr.push(loc);
      map.set(loc.teamId, arr);
    });
    return map;
  }, [locations]);

  const connectionsGeoJson = useMemo(() => {
    if (!challenges || !bases) return null;
    const features = challenges
      .filter((c) => c.unlocksBaseId)
      .map((challenge) => {
        const from = bases.find((b) => b.fixedChallengeId === challenge.id);
        const to = bases.find((b) => b.id === challenge.unlocksBaseId);
        if (!from || !to) return null;
        return {
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "LineString" as const,
            coordinates: [[from.lng, from.lat], [to.lng, to.lat]],
          },
        };
      })
      .filter(Boolean) as GeoJSON.Feature[];
    return features.length > 0
      ? { type: "FeatureCollection" as const, features }
      : null;
  }, [challenges, bases]);

  const selectedTeam = viewMode !== "all" ? teams.find((t) => t.id === viewMode) : null;
  const markerLocations = useMemo(() => {
    if (viewMode !== "all") {
      return locations.filter((loc) => loc.teamId === viewMode);
    }

    const latestByTeam = new Map<string, TeamLocation>();
    locations.forEach((loc) => {
      const existing = latestByTeam.get(loc.teamId);
      if (!existing) {
        latestByTeam.set(loc.teamId, loc);
        return;
      }

      const currentTs = parseTimestamp(loc.updatedAt);
      const existingTs = parseTimestamp(existing.updatedAt);
      if (currentTs > existingTs || (currentTs === existingTs && loc.playerId > existing.playerId)) {
        latestByTeam.set(loc.teamId, loc);
      }
    });

    return Array.from(latestByTeam.values());
  }, [locations, viewMode]);

  if (isLoading && !hasData) {
    return <Spinner />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("mapPage.title")}</h1>
          <p className="text-muted-foreground">{t("mapPage.description")}</p>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            variant={showBases ? "default" : "outline"}
            size="sm"
            onClick={() => setShowBases(!showBases)}
          >
            {showBases ? <Eye className="mr-1.5 h-3.5 w-3.5" /> : <EyeOff className="mr-1.5 h-3.5 w-3.5" />}
            <MapPin className="mr-1 h-3.5 w-3.5" />
            {t("nav.bases")}
          </Button>
          <Button
            variant={showTeams ? "default" : "outline"}
            size="sm"
            onClick={() => setShowTeams(!showTeams)}
          >
            {showTeams ? <Eye className="mr-1.5 h-3.5 w-3.5" /> : <EyeOff className="mr-1.5 h-3.5 w-3.5" />}
            <Radio className="mr-1 h-3.5 w-3.5" />
            {t("nav.teams")}
          </Button>
        </div>
      </div>
      {websocketError && <Alert>{websocketError}</Alert>}
      {isError && (
        <Alert>{t("mapPage.loadError")}</Alert>
      )}

      {/* View mode indicator */}
      {selectedTeam && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 py-1 px-3 text-sm">
            <User className="h-3.5 w-3.5" />
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selectedTeam.color }} />
            {t("mapPage.viewingTeam", { team: selectedTeam.name })}
          </Badge>
          <Button variant="ghost" size="sm" onClick={() => setViewMode("all")}>
            <Users className="mr-1.5 h-3.5 w-3.5" />
            {t("common.allTeams")}
          </Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <MapGL
            ref={mapRef}
            initialViewState={{ longitude: defaultCenter.lng, latitude: defaultCenter.lat, zoom: 13 }}
            style={{ width: "100%", height: "550px" }}
            mapStyle={getResolvedStyleUrl(game?.tileSource, dark)}
            onClick={() => { setPopupBase(null); setPopupLoc(null); }}
          >
            {/* Base markers */}
            {showBases && bases.map((base) => {
              const color = getBaseColor(base.id);
              const isOpen = popupBase === base.id;
              const baseProgress = progressIndex.get(base.id);

              return (
                <Marker
                  key={`${base.id}-${viewMode}-${color}`}
                  longitude={base.lng}
                  latitude={base.lat}
                  anchor="bottom"
                  onClick={(e) => { e.originalEvent.stopPropagation(); setPopupBase(isOpen ? null : base.id); setPopupLoc(null); }}
                >
                  <PinMarkerSvg color={color} />
                  {isOpen && (
                    <div
                      className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow-lg p-3 min-w-[220px] max-w-[300px] z-10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button aria-label="Close" className="absolute top-1 right-1 text-gray-400 hover:text-gray-600 text-xs px-1" onClick={() => setPopupBase(null)}>x</button>
                      <p className="font-semibold text-sm">{base.name}</p>
                      {base.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{base.description}</p>
                      )}

                      {viewMode === "all" ? (
                        <div className="mt-2 space-y-1">
                          {teams.map((team) => {
                            const tp = baseProgress?.get(team.id);
                            const status: BaseStatus = tp?.status ?? "not_visited";
                            return (
                              <div
                                key={team.id}
                                className="flex items-center justify-between gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5"
                                onClick={() => setViewMode(team.id)}
                              >
                                <div className="flex items-center gap-1.5">
                                  <div
                                    className="h-2 w-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: team.color }}
                                  />
                                  <span className="text-xs">{team.name}</span>
                                </div>
                                <StatusBadge status={status} />
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        (() => {
                          const tp = baseProgress?.get(viewMode);
                          const status: BaseStatus = tp?.status ?? "not_visited";
                          const challengeInfo = tp?.challengeId ? challengeMap.get(tp.challengeId) : null;
                          const team = teamMap.get(viewMode);

                          return (
                            <div className="mt-2">
                              {team && (
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: team.color }} />
                                  <span className="text-xs font-medium">{team.name}</span>
                                  <StatusBadge status={status} />
                                </div>
                              )}
                              {challengeInfo ? (
                                <div className="border rounded p-1.5 mt-1">
                                  <p className="text-xs font-medium text-gray-700">
                                    {t("common.challenge")}: {challengeInfo.title}
                                  </p>
                                  {challengeInfo.description && (
                                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                                      {challengeInfo.description}
                                    </p>
                                  )}
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    {challengeInfo.points} {t("common.pts")}
                                  </p>
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400 italic mt-1">
                                  {t("mapPage.noChallenge")}
                                </p>
                              )}
                            </div>
                          );
                        })()
                      )}

                      <p className="text-xs text-gray-400 mt-1.5">
                        {base.lat.toFixed(5)}, {base.lng.toFixed(5)}
                      </p>
                    </div>
                  )}
                </Marker>
              );
            })}

            {/* Unlock connection lines */}
            {connectionsGeoJson && (
              <Source id="unlock-connections" type="geojson" data={connectionsGeoJson}>
                <Layer
                  id="unlock-connection-lines"
                  type="line"
                  paint={{
                    "line-color": "#6b7280",
                    "line-width": 2,
                    "line-opacity": 0.5,
                    "line-dasharray": [8, 8],
                  }}
                />
              </Source>
            )}

            {/* Team location markers in all-view; player markers in team-view */}
            {showTeams && markerLocations.map((loc) => {
              const team = teamMap.get(loc.teamId);
              if (!team) return null;

              const playerName = loc.displayName?.trim() || "-";
              const isStale = now - parseTimestamp(loc.updatedAt) > STALE_THRESHOLD_MS;
              const isAggregateView = viewMode === "all";
              const locKey = isAggregateView ? `team-${loc.teamId}` : loc.playerId;
              const isOpen = popupLoc === locKey;

              return (
                <Marker
                  key={`${locKey}-${loc.lat}-${loc.lng}-${isStale}`}
                  longitude={loc.lng}
                  latitude={loc.lat}
                  anchor="center"
                  onClick={(e) => { e.originalEvent.stopPropagation(); setPopupLoc(isOpen ? null : locKey); setPopupBase(null); }}
                >
                  <CircleDot color={team.color} stale={isStale} />
                  {isOpen && (
                    <div
                      className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow-lg p-3 min-w-[140px] z-10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button aria-label="Close" className="absolute top-1 right-1 text-gray-400 hover:text-gray-600 text-xs px-1" onClick={() => setPopupLoc(null)}>x</button>
                      <p className="font-semibold text-sm">{isAggregateView ? team.name : playerName}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: team.color }}
                        />
                        <p className="text-xs text-gray-500">
                          {isAggregateView ? t("mapPage.latestPingBy", { player: playerName }) : team.name}
                        </p>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatDateTime(loc.updatedAt)}
                      </p>
                      {isStale && (
                        <p className="text-xs text-amber-600 font-medium mt-1">
                          {t("common.noSignal")}
                        </p>
                      )}
                    </div>
                  )}
                </Marker>
              );
            })}
          </MapGL>
        </CardContent>
      </Card>

      {/* Sidebar panels */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Bases panel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-4 w-4" /> {t("nav.bases")} ({bases.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {bases.map((base) => {
                const status = viewMode === "all"
                  ? getAggregateStatus(base.id)
                  : (progressIndex.get(base.id)?.get(viewMode)?.status ?? "not_visited");
                const baseProgress = progressIndex.get(base.id);
                const completedCount = teams.filter((team) => baseProgress?.get(team.id)?.status === "completed").length;
                return (
                  <div key={base.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: STATUS_COLORS[status] }}
                      />
                      <span>{base.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {viewMode === "all" && (
                        <span className="text-xs text-muted-foreground font-medium">{completedCount}/{teams.length}</span>
                      )}
                      <StatusBadge status={status} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Teams panel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Radio className="h-4 w-4" /> {t("nav.teams")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {teams.map((team) => {
                const teamLocs = locationsByTeam.get(team.id) ?? [];
                const isActive = viewMode === team.id;

                return (
                  <div key={team.id}>
                    <div
                      className={`flex items-center justify-between text-sm cursor-pointer rounded px-1.5 py-1 transition-colors ${
                        isActive ? "bg-muted ring-1 ring-ring" : "hover:bg-muted/50"
                      }`}
                      onClick={() => setViewMode(isActive ? "all" : team.id)}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full border"
                          style={{
                            backgroundColor: team.color,
                            borderColor: team.color,
                          }}
                        />
                        <span className={isActive ? "font-medium" : ""}>{team.name}</span>
                      </div>
                      {teamLocs.length === 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {t("common.noSignal")}
                        </Badge>
                      )}
                    </div>
                    {teamLocs.length > 0 && (
                      <div className="ml-6 mt-0.5 space-y-0.5">
                        {teamLocs.map((loc) => {
                          const isStale = now - parseTimestamp(loc.updatedAt) > STALE_THRESHOLD_MS;
                          return (
                            <div key={loc.playerId} className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{loc.displayName}</span>
                              <div className="flex items-center gap-1.5">
                                {isStale && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                    {t("common.noSignal")}
                                  </Badge>
                                )}
                                <span>{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
