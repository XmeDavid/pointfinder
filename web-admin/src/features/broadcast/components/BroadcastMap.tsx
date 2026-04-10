import { useMemo, useEffect, useState, useRef } from "react";
import { Map as MapGL, Marker } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  BroadcastBase,
  BroadcastTeam,
  BroadcastLocation,
  BroadcastProgress,
} from "@/lib/api/broadcast";
import { STATUS_COLORS, STATUS_PRIORITY, computeBounds } from "@/lib/map-utils";
import { PinMarkerSvg, CircleDot } from "@/components/common/MapMarkers";
import { getResolvedStyleUrl, getDefaultCenter } from "@/lib/tile-sources";
import type { BaseStatus } from "@/types";
import type { MapRef } from "react-map-gl/maplibre";

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

interface Props {
  bases: BroadcastBase[];
  teams: BroadcastTeam[];
  locations: BroadcastLocation[];
  progress: BroadcastProgress[];
  tileSource?: string;
}

export function BroadcastMap({ bases, teams, locations, progress, tileSource }: Props) {
  const mapRef = useRef<MapRef>(null);
  const fittedRef = useRef(false);

  const teamMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    teams.forEach((t) => map.set(t.id, { name: t.name, color: t.color }));
    return map;
  }, [teams]);

  const progressIndex = useMemo(() => {
    const idx = new Map<string, Map<string, string>>();
    progress.forEach((p) => {
      if (!idx.has(p.baseId)) idx.set(p.baseId, new Map());
      idx.get(p.baseId)!.set(p.teamId, p.status);
    });
    return idx;
  }, [progress]);

  const getAggregateStatus = (baseId: string): string => {
    const baseProgress = progressIndex.get(baseId);
    if (!baseProgress || baseProgress.size === 0) return "not_visited";
    let minPriority = Infinity;
    let minStatus = "not_visited";
    baseProgress.forEach((status) => {
      const priority = STATUS_PRIORITY[status as keyof typeof STATUS_PRIORITY] ?? 0;
      if (priority < minPriority) { minPriority = priority; minStatus = status; }
    });
    return minStatus;
  };

  // Latest location per team
  const latestByTeam = useMemo(() => {
    const map = new Map<string, BroadcastLocation>();
    locations.forEach((loc) => {
      const existing = map.get(loc.teamId);
      if (!existing) {
        map.set(loc.teamId, loc);
        return;
      }
      const currentTs = Date.parse(loc.updatedAt) || 0;
      const existingTs = Date.parse(existing.updatedAt) || 0;
      if (currentTs > existingTs) {
        map.set(loc.teamId, loc);
      }
    });
    return Array.from(map.values());
  }, [locations]);

  const fallback = getDefaultCenter(tileSource);
  const defaultCenter: [number, number] =
    bases.length > 0
      ? [
          bases.reduce((s, b) => s + b.lng, 0) / bases.length,
          bases.reduce((s, b) => s + b.lat, 0) / bases.length,
        ]
      : [fallback.lng, fallback.lat];

  useEffect(() => {
    if (bases.length > 0 && mapRef.current && !fittedRef.current) {
      const bounds = computeBounds(bases);
      if (bounds) {
        mapRef.current.fitBounds(bounds, { padding: 40, maxZoom: 16 });
        fittedRef.current = true;
      }
    }
  }, [bases]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-full rounded-xl border border-white/10 overflow-hidden">
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: defaultCenter[0], latitude: defaultCenter[1], zoom: 13 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle={getResolvedStyleUrl(tileSource, true)}
        scrollZoom={false}
        dragPan={false}
        dragRotate={false}
        touchZoomRotate={false}
        doubleClickZoom={false}
        keyboard={false}
        attributionControl={false}
      >
        {bases.map((base) => {
          const status = getAggregateStatus(base.id);
          const color = STATUS_COLORS[status as BaseStatus] ?? STATUS_COLORS.not_visited;
          return (
            <Marker key={base.id} longitude={base.lng} latitude={base.lat} anchor="bottom">
              <PinMarkerSvg color={color} />
            </Marker>
          );
        })}

        {latestByTeam.map((loc) => {
          const team = teamMap.get(loc.teamId);
          if (!team) return null;
          const isStale = now - (Date.parse(loc.updatedAt) || 0) > STALE_THRESHOLD_MS;

          return (
            <Marker key={`team-${loc.teamId}`} longitude={loc.lng} latitude={loc.lat} anchor="center">
              <CircleDot color={team.color} stale={isStale} />
            </Marker>
          );
        })}
      </MapGL>
    </div>
  );
}
