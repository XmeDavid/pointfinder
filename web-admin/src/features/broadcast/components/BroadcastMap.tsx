import { useMemo, useEffect, useState, useRef } from "react";
import { Map as MapGL, Marker, Source, Layer } from "react-map-gl/maplibre";
import type { LayerProps } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  BroadcastBase,
  BroadcastTeam,
  BroadcastLocation,
  BroadcastProgress,
} from "@/lib/api/broadcast";
import { STATUS_COLORS, getAggregateStatusFlat, computeBounds } from "@/lib/map-utils";
import { PinMarkerSvg } from "@/components/common/MapMarkers";
import { getResolvedStyleUrl, getDefaultCenter } from "@/lib/tile-sources";
import type { MapRef } from "react-map-gl/maplibre";
import { BroadcastPanel } from "@/components/broadcast/BroadcastPanel";
import { lightColorValues } from "@/generated/colorValues";

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// Cluster colors matching iOS/Android
const CLUSTER_COLOR_SMALL = lightColorValues["status.checkedIn"];
const CLUSTER_COLOR_MEDIUM = lightColorValues["action.primaryStrong"];
const CLUSTER_COLOR_LARGE = lightColorValues["status.pending"];
const CLUSTER_STROKE = "#ffffff";
const STALE_STROKE = "#9ca3af";

const BROADCAST_SOURCE_ID = "broadcast-team-locations";

const broadcastClusterCircle: LayerProps = {
  id: "broadcast-cluster-circle",
  type: "circle",
  filter: ["has", "point_count"],
  paint: {
    "circle-radius": ["step", ["get", "point_count"], 14, 5, 20, 10, 26],
    "circle-color": [
      "step",
      ["get", "point_count"],
      CLUSTER_COLOR_SMALL,
      5,
      CLUSTER_COLOR_MEDIUM,
      10,
      CLUSTER_COLOR_LARGE,
    ],
    "circle-stroke-width": 2,
    "circle-stroke-color": CLUSTER_STROKE,
  },
};

const broadcastClusterCount: LayerProps = {
  id: "broadcast-cluster-count",
  type: "symbol",
  filter: ["has", "point_count"],
  layout: {
    "text-field": ["get", "point_count_abbreviated"],
    "text-size": ["step", ["get", "point_count"], 10, 5, 11, 10, 13],
    "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
    "text-allow-overlap": true,
    "text-ignore-placement": true,
  },
  paint: {
    "text-color": "#ffffff",
  },
};

const broadcastIndividualPoint: LayerProps = {
  id: "broadcast-individual-point",
  type: "circle",
  filter: ["!", ["has", "point_count"]],
  paint: {
    "circle-radius": 7,
    "circle-color": ["get", "color"],
    "circle-opacity": ["case", ["==", ["get", "stale"], true], 0.4, 0.9],
    "circle-stroke-width": 2,
    "circle-stroke-color": [
      "case",
      ["==", ["get", "stale"], true],
      STALE_STROKE,
      CLUSTER_STROKE,
    ],
  },
};

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

  const teamLocationGeojson = useMemo((): GeoJSON.FeatureCollection => {
    const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
    for (const loc of latestByTeam) {
      const team = teamMap.get(loc.teamId);
      if (!team) continue;
      const isStale = now - (Date.parse(loc.updatedAt) || 0) > STALE_THRESHOLD_MS;
      features.push({
        type: "Feature",
        properties: {
          teamId: loc.teamId,
          teamName: team.name,
          color: team.color || CLUSTER_COLOR_SMALL,
          stale: isStale,
        },
        geometry: {
          type: "Point",
          coordinates: [loc.lng, loc.lat],
        },
      });
    }
    return { type: "FeatureCollection", features };
  }, [latestByTeam, teamMap, now]);

  return (
    <BroadcastPanel className="h-full" contentClassName="p-0">
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
          const status = getAggregateStatusFlat(base.id, progressIndex);
          const color = STATUS_COLORS[status] ?? STATUS_COLORS.not_visited;
          return (
            <Marker key={base.id} longitude={base.lng} latitude={base.lat} anchor="bottom">
              <PinMarkerSvg color={color} />
            </Marker>
          );
        })}

        <Source
          id={BROADCAST_SOURCE_ID}
          type="geojson"
          data={teamLocationGeojson}
          cluster={true}
          clusterRadius={50}
          clusterMaxZoom={14}
        >
          <Layer {...broadcastClusterCircle} />
          <Layer {...broadcastClusterCount} />
          <Layer {...broadcastIndividualPoint} />
        </Source>
      </MapGL>
    </BroadcastPanel>
  );
}
