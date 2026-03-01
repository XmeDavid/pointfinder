import { useMemo, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type {
  BroadcastBase,
  BroadcastTeam,
  BroadcastLocation,
  BroadcastProgress,
} from "@/lib/api/broadcast";

const STALE_THRESHOLD_MS = 5 * 60 * 1000;

const STATUS_COLORS: Record<string, string> = {
  not_visited: "#9ca3af",
  checked_in: "#3b82f6",
  submitted: "#f59e0b",
  completed: "#22c55e",
  rejected: "#ef4444",
};

const STATUS_PRIORITY: Record<string, number> = {
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
    baseProgress.forEach((status) => {
      const priority = STATUS_PRIORITY[status] ?? 0;
      if (priority < minPriority) minPriority = priority;
    });
    const entry = Object.entries(STATUS_PRIORITY).find(([, v]) => v === minPriority);
    return entry?.[0] ?? "not_visited";
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
          const color = STATUS_COLORS[status] ?? STATUS_COLORS.not_visited;
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
