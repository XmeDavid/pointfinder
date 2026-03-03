import { useMemo, useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, CircleMarker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type {
  BroadcastBase,
  BroadcastTeam,
  BroadcastLocation,
  BroadcastProgress,
} from "@/lib/api/broadcast";
import { STATUS_COLORS, STATUS_PRIORITY, createColoredIcon, FitBounds } from "@/lib/map-utils";
import type { BaseStatus } from "@/types";

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

interface Props {
  bases: BroadcastBase[];
  teams: BroadcastTeam[];
  locations: BroadcastLocation[];
  progress: BroadcastProgress[];
}

export function BroadcastMap({ bases, teams, locations, progress }: Props) {
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

  const defaultCenter: [number, number] =
    bases.length > 0
      ? [
          bases.reduce((s, b) => s + b.lat, 0) / bases.length,
          bases.reduce((s, b) => s + b.lng, 0) / bases.length,
        ]
      : [40.088, -8.869];

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-full rounded-xl border border-white/10 overflow-hidden">
      <MapContainer
        center={defaultCenter}
        zoom={13}
        className="h-full w-full z-0"
        scrollWheelZoom={false}
        dragging={false}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <FitBounds bases={bases} />

        {bases.map((base) => {
          const status = getAggregateStatus(base.id);
          const color = STATUS_COLORS[status as BaseStatus] ?? STATUS_COLORS.not_visited;
          return (
            <Marker
              key={base.id}
              position={[base.lat, base.lng]}
              icon={createColoredIcon(color)}
            />
          );
        })}

        {latestByTeam.map((loc) => {
          const team = teamMap.get(loc.teamId);
          if (!team) return null;
          const isStale = now - (Date.parse(loc.updatedAt) || 0) > STALE_THRESHOLD_MS;

          return (
            <CircleMarker
              key={`team-${loc.teamId}`}
              center={[loc.lat, loc.lng]}
              radius={10}
              pathOptions={{
                color: isStale ? "#9ca3af" : team.color,
                fillColor: team.color,
                fillOpacity: isStale ? 0.4 : 0.8,
                weight: isStale ? 1 : 2,
                dashArray: isStale ? "4 4" : undefined,
              }}
            />
          );
        })}
      </MapContainer>
    </div>
  );
}
