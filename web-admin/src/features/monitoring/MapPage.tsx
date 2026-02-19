import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Radio, Eye, EyeOff, Users, User } from "lucide-react";
import { useState, useMemo, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { basesApi } from "@/lib/api/bases";
import { teamsApi } from "@/lib/api/teams";
import { challengesApi } from "@/lib/api/challenges";
import { monitoringApi } from "@/lib/api/monitoring";
import { useTranslation } from "react-i18next";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { formatDateTime } from "@/lib/utils";
import type { BaseStatus } from "@/types";

// Fix default marker icon issue with bundlers (known react-leaflet issue)
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

type IconDefaultPrototype = typeof L.Icon.Default.prototype & { _getIconUrl?: unknown };
delete (L.Icon.Default.prototype as IconDefaultPrototype)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

// Status colors for pins
const STATUS_COLORS: Record<BaseStatus, string> = {
  not_visited: "#9ca3af",  // gray
  checked_in: "#3b82f6",   // blue
  submitted: "#f59e0b",    // amber
  completed: "#22c55e",    // green
  rejected: "#ef4444",     // red
};

// Status priority for aggregate (lowest = worst)
const STATUS_PRIORITY: Record<BaseStatus, number> = {
  not_visited: 0,
  checked_in: 1,
  submitted: 2,
  rejected: 3,
  completed: 4,
};

function createColoredIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    html: `<svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.5 0C5.6 0 0 5.6 0 12.5C0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0Z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
      <circle cx="12.5" cy="12.5" r="5" fill="#fff"/>
    </svg>`,
  });
}

/** Auto-fits map bounds when bases load */
function FitBounds({ bases }: { bases: { lat: number; lng: number }[] }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (bases.length > 0 && !fitted.current) {
      const bounds = L.latLngBounds(bases.map((b) => [b.lat, b.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      fitted.current = true;
    }
  }, [bases, map]);

  return null;
}

function StatusBadge({ status }: { status: BaseStatus }) {
  const { t } = useTranslation();

  const labels: Record<BaseStatus, string> = {
    not_visited: t("mapPage.notVisited"),
    checked_in: t("mapPage.checkedIn"),
    submitted: t("mapPage.submitted"),
    completed: t("mapPage.completed"),
    rejected: t("mapPage.rejected"),
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
  const { gameId } = useParams<{ gameId: string }>();

  const { data: bases = [] } = useQuery({ queryKey: ["bases", gameId], queryFn: () => basesApi.listByGame(gameId!) });
  const { data: teams = [] } = useQuery({ queryKey: ["teams", gameId], queryFn: () => teamsApi.listByGame(gameId!) });
  const { data: challenges = [] } = useQuery({ queryKey: ["challenges", gameId], queryFn: () => challengesApi.listByGame(gameId!) });
  const { data: progress = [] } = useQuery({ queryKey: ["progress", gameId], queryFn: () => monitoringApi.getProgress(gameId!) });
  const websocketError = useGameWebSocket(gameId);
  const { data: locations = [], dataUpdatedAt: locationsUpdatedAt } = useQuery({
    queryKey: ["team-locations", gameId],
    queryFn: () => monitoringApi.getTeamLocations(gameId!),
  });

  const [showBases, setShowBases] = useState(true);
  const [showTeams, setShowTeams] = useState(true);
  // "all" = default aggregate view, string = teamId for team-specific view
  const [viewMode, setViewMode] = useState<"all" | string>("all");

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

  // Get user's current location or fallback (only if no bases)
  const [userLocation, setUserLocation] = useState<[number, number]>([40.08789650218038, -8.869461715221407]);

  useEffect(() => {
    if (bases.length === 0 && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
        },
        () => {
          // Geolocation failed, use fallback
          setUserLocation([40.08789650218038, -8.869461715221407]);
        }
      );
    }
  }, [bases.length]);

  // Default center - will be overridden by FitBounds when bases exist
  const defaultCenter: [number, number] = bases.length > 0
    ? [bases.reduce((s, b) => s + b.lat, 0) / bases.length, bases.reduce((s, b) => s + b.lng, 0) / bases.length]
    : userLocation;

  // Compute aggregate status for a base (lowest common denominator across all teams)
  const getAggregateStatus = (baseId: string): BaseStatus => {
    const baseProgress = progressIndex.get(baseId);
    if (!baseProgress || baseProgress.size === 0) return "not_visited";

    let minPriority = Infinity;
    baseProgress.forEach((p) => {
      const priority = STATUS_PRIORITY[p.status];
      if (priority < minPriority) minPriority = priority;
    });

    // Map back to status
    const entry = Object.entries(STATUS_PRIORITY).find(([, v]) => v === minPriority);
    return (entry?.[0] as BaseStatus) ?? "not_visited";
  };

  // Get pin color for a base
  const getBaseColor = (baseId: string): string => {
    if (viewMode === "all") {
      return STATUS_COLORS[getAggregateStatus(baseId)];
    }
    // Team-specific view
    const teamProgress = progressIndex.get(baseId)?.get(viewMode);
    return STATUS_COLORS[teamProgress?.status ?? "not_visited"];
  };

  const selectedTeam = viewMode !== "all" ? teams.find((t) => t.id === viewMode) : null;
  const markerLocations = useMemo(() => {
    if (viewMode !== "all") {
      return locations.filter((loc) => loc.teamId === viewMode);
    }

    const latestByTeam = new Map<string, (typeof locations)[number]>();
    locations.forEach((loc) => {
      const existing = latestByTeam.get(loc.teamId);
      if (!existing) {
        latestByTeam.set(loc.teamId, loc);
        return;
      }

      const currentTs = parseTimestamp(loc.updatedAt);
      const existingTs = parseTimestamp(existing.updatedAt);
      // Keep ordering deterministic if timestamps are equal.
      if (currentTs > existingTs || (currentTs === existingTs && loc.playerId > existing.playerId)) {
        latestByTeam.set(loc.teamId, loc);
      }
    });

    return Array.from(latestByTeam.values());
  }, [locations, viewMode]);

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
      {websocketError && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{websocketError}</div>}

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
            {t("mapPage.allTeams")}
          </Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <MapContainer
            center={defaultCenter}
            zoom={13}
            className="h-[550px] w-full z-0"
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds bases={bases} />

            {/* Base markers */}
            {showBases && bases.map((base) => {
              const color = getBaseColor(base.id);
              const baseProgress = progressIndex.get(base.id);

              return (
                <Marker
                  key={`${base.id}-${viewMode}-${color}`}
                  position={[base.lat, base.lng]}
                  icon={createColoredIcon(color)}
                >
                  <Popup>
                    <div className="min-w-[220px]">
                      <p className="font-semibold text-sm">{base.name}</p>
                      {base.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{base.description}</p>
                      )}

                      {viewMode === "all" ? (
                        /* Default view: show team list with statuses */
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
                        /* Team view: show challenge assigned to this team */
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
                                    {t("mapPage.challenge")}: {challengeInfo.title}
                                  </p>
                                  {challengeInfo.description && (
                                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                                      {challengeInfo.description}
                                    </p>
                                  )}
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    {challengeInfo.points} pts
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
                  </Popup>
                </Marker>
              );
            })}

            {/* Team location markers in all-view; player markers in team-view */}
            {showTeams && markerLocations.map((loc) => {
              const team = teamMap.get(loc.teamId);
              if (!team) return null;

              const playerName = loc.displayName?.trim() || "-";
              const isStale = now - parseTimestamp(loc.updatedAt) > STALE_THRESHOLD_MS;
              const isAggregateView = viewMode === "all";

              return (
                <CircleMarker
                  key={`${isAggregateView ? `team-${loc.teamId}` : loc.playerId}-${loc.lat}-${loc.lng}-${isStale}`}
                  center={[loc.lat, loc.lng]}
                  radius={isAggregateView ? 10 : 8}
                  pathOptions={{
                    color: isStale ? "#9ca3af" : team.color,
                    fillColor: team.color,
                    fillOpacity: isStale ? 0.4 : 0.8,
                    weight: isStale ? 1 : 2,
                    dashArray: isStale ? "4 4" : undefined,
                  }}
                >
                  <Popup>
                    <div className="min-w-[140px]">
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
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
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
                const teamLocs = locations.filter((l) => l.teamId === team.id);
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
