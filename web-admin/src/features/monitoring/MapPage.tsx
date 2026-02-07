import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Radio, Eye, EyeOff } from "lucide-react";
import { useState, useMemo, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { basesApi } from "@/lib/api/bases";
import { teamsApi } from "@/lib/api/teams";
import { assignmentsApi } from "@/lib/api/assignments";
import { challengesApi } from "@/lib/api/challenges";
import { monitoringApi } from "@/lib/api/monitoring";
import { useTranslation } from "react-i18next";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { formatDateTime } from "@/lib/utils";

// Fix default marker icon issue with bundlers (known react-leaflet issue)
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

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

export function MapPage() {
  const { t } = useTranslation();
  const { gameId } = useParams<{ gameId: string }>();

  const { data: bases = [] } = useQuery({ queryKey: ["bases", gameId], queryFn: () => basesApi.listByGame(gameId!) });
  const { data: teams = [] } = useQuery({ queryKey: ["teams", gameId], queryFn: () => teamsApi.listByGame(gameId!) });
  const { data: challenges = [] } = useQuery({ queryKey: ["challenges", gameId], queryFn: () => challengesApi.listByGame(gameId!) });
  const { data: assignments = [] } = useQuery({ queryKey: ["assignments", gameId], queryFn: () => assignmentsApi.listByGame(gameId!) });
  useGameWebSocket(gameId);
  const { data: locations = [] } = useQuery({ queryKey: ["team-locations", gameId], queryFn: () => monitoringApi.getTeamLocations(gameId!) });

  const [showBases, setShowBases] = useState(true);
  const [showTeams, setShowTeams] = useState(true);
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());

  // Initialize selected teams to all teams when data loads
  useEffect(() => {
    if (teams.length > 0 && selectedTeamIds.size === 0) {
      setSelectedTeamIds(new Set(teams.map((t) => t.id)));
    }
  }, [teams, selectedTeamIds.size]);

  const challengeMap = useMemo(() => {
    const map = new Map<string, string>();
    challenges.forEach((c) => map.set(c.id, c.title));
    return map;
  }, [challenges]);

  const now = Date.now();

  // Default center (Europe) if no bases
  const defaultCenter: [number, number] = bases.length > 0
    ? [bases.reduce((s, b) => s + b.lat, 0) / bases.length, bases.reduce((s, b) => s + b.lng, 0) / bases.length]
    : [48.8, 9.2];

  const toggleTeam = (teamId: string) => {
    setSelectedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("mapPage.title")}</h1>
          <p className="text-muted-foreground">{t("mapPage.description")}</p>
        </div>
        <div className="flex items-center gap-2">
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
              const baseAssignments = assignments.filter((a) => a.baseId === base.id);
              const assignedChallengeNames = [...new Set(
                baseAssignments
                  .map((a) => challengeMap.get(a.challengeId))
                  .filter(Boolean)
              )];

              return (
                <Marker key={base.id} position={[base.lat, base.lng]}>
                  <Popup>
                    <div className="min-w-[180px]">
                      <p className="font-semibold text-sm">{base.name}</p>
                      {base.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{base.description}</p>
                      )}
                      {assignedChallengeNames.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-gray-600">{t("nav.challenges")}:</p>
                          <ul className="text-xs text-gray-500 mt-0.5 list-disc list-inside">
                            {assignedChallengeNames.map((name, i) => (
                              <li key={i}>{name}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {base.lat.toFixed(5)}, {base.lng.toFixed(5)}
                      </p>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* Team location markers */}
            {showTeams && teams.map((team) => {
              if (!selectedTeamIds.has(team.id)) return null;
              const loc = locations.find((l) => l.teamId === team.id);
              if (!loc) return null;

              const isStale = now - new Date(loc.updatedAt).getTime() > STALE_THRESHOLD_MS;

              return (
                <CircleMarker
                  key={team.id}
                  center={[loc.lat, loc.lng]}
                  radius={10}
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
                      <div className="flex items-center gap-1.5">
                        <div
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: team.color }}
                        />
                        <p className="font-semibold text-sm">{team.name}</p>
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

      {/* Team filter + info panels */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-4 w-4" /> {t("nav.bases")} ({bases.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {bases.map((base) => (
                <div key={base.id} className="flex items-center justify-between text-sm">
                  <span>{base.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {base.lat.toFixed(4)}, {base.lng.toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Radio className="h-4 w-4" /> {t("mapPage.teamLocations")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {teams.map((team) => {
                const loc = locations.find((l) => l.teamId === team.id);
                const isStale = loc
                  ? now - new Date(loc.updatedAt).getTime() > STALE_THRESHOLD_MS
                  : false;
                const isSelected = selectedTeamIds.has(team.id);

                return (
                  <div
                    key={team.id}
                    className={`flex items-center justify-between text-sm cursor-pointer rounded px-1.5 py-1 transition-colors ${
                      isSelected ? "bg-muted/50" : "opacity-50"
                    }`}
                    onClick={() => toggleTeam(team.id)}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full border"
                        style={{
                          backgroundColor: isSelected ? team.color : "transparent",
                          borderColor: team.color,
                        }}
                      />
                      <span>{team.name}</span>
                    </div>
                    {loc ? (
                      <div className="flex items-center gap-1.5">
                        {isStale && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {t("common.noSignal")}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                        </span>
                      </div>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        {t("common.noSignal")}
                      </Badge>
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
