import { useEffect, useRef, useCallback, useState } from "react";
import { Map as MapGL, Marker, Source, Layer } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { Lock, Unlock, Pencil, EyeOff, Wifi, WifiOff } from "lucide-react";
import { computeBounds } from "@/lib/map-utils";
import { PinMarkerSvg } from "@/components/common/MapMarkers";
import { getResolvedStyleUrl, getDefaultCenter } from "@/lib/tile-sources";
import { useThemeStore } from "@/hooks/useTheme";
import { useTranslation } from "react-i18next";
import type { MapRef } from "react-map-gl/maplibre";
import type { GeoJSON } from "geojson";

interface MapPickerProps {
  value: { lat: number; lng: number };
  onChange: (lat: number, lng: number) => void;
  className?: string;
  tileSource?: string;
}

export function MapPicker({ value, onChange, className, tileSource }: MapPickerProps) {
  const { dark } = useThemeStore();
  const mapRef = useRef<MapRef>(null);
  const [locked, setLocked] = useState(true);
  const [hovered, setHovered] = useState(false);

  const handleMoveEnd = useCallback(() => {
    const center = mapRef.current?.getCenter();
    if (center) {
      onChange(center.lat, center.lng);
    }
  }, [onChange]);

  const rafRef = useRef<number>(0);

  const handleLoad = useCallback(() => {
    // MapLibre canvas may render at 0×0 when inside a dialog/modal.
    // A deferred resize forces it to re-measure the container.
    rafRef.current = requestAnimationFrame(() => {
      mapRef.current?.resize();
    });
  }, []);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      mapRef.current?.getMap().remove();
    };
  }, []);

  return (
    <div className="relative">
      <div
        className={`${className} relative`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <MapGL
          ref={mapRef}
          initialViewState={{ longitude: value.lng, latitude: value.lat, zoom: 15 }}
          style={{ width: "100%", height: "100%", borderRadius: "0.375rem" }}
          mapStyle={getResolvedStyleUrl(tileSource, dark)}
          onLoad={handleLoad}
          onMoveEnd={handleMoveEnd}
          scrollZoom={!locked}
          dragPan={!locked}
          dragRotate={!locked}
          touchZoomRotate={!locked}
          doubleClickZoom={!locked}
          touchPitch={!locked}
        />
        {/* Fixed center pin */}
        <div className="absolute left-1/2 top-1/2 pointer-events-none z-10">
          <PinMarkerSvg color="#3b82f6" />
        </div>
        {/* Lock overlay — fades in on hover when locked */}
        {locked && (
          <div
            className={`absolute inset-0 z-20 rounded-md flex items-center justify-center transition-opacity duration-300 ${
              hovered ? "opacity-100" : "opacity-0"
            }`}
            style={{ background: "rgba(0,0,0,0.35)" }}
          >
            <button
              type="button"
              onClick={() => setLocked(false)}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-white text-gray-800 text-sm font-medium shadow-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <Unlock className="h-4 w-4" />
              Unlock map
            </button>
          </div>
        )}
        {/* Lock button — inside map, top-right corner */}
        {!locked && (
          <button
            type="button"
            onClick={() => setLocked(true)}
            className="absolute top-2 right-2 z-20 p-2 rounded-md border border-input bg-background/90 backdrop-blur-sm hover:bg-accent text-muted-foreground transition-colors shadow-sm cursor-pointer"
            title="Lock map"
          >
            <Lock className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// Read-only map for displaying multiple markers
interface BaseMarker {
  id: string;
  name: string;
  description?: string;
  lat: number;
  lng: number;
  nfcLinked: boolean;
  hidden: boolean;
  fixedChallengeName?: string;
}

export interface UnlockConnection {
  fromBaseId: string;
  toBaseId: string;
}

interface BaseMapViewProps {
  bases: BaseMarker[];
  connections?: UnlockConnection[];
  className?: string;
  onEdit?: (baseId: string) => void;
  tileSource?: string;
}

export function BaseMapView({ bases, connections, className, onEdit, tileSource }: BaseMapViewProps) {
  const { t } = useTranslation();
  const { dark } = useThemeStore();
  const mapRef = useRef<MapRef>(null);
  const fittedRef = useRef(false);
  const [popup, setPopup] = useState<BaseMarker | null>(null);

  const tileSourceCenter = getDefaultCenter(tileSource);
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

  const userLocation: [number, number] = geoLocation ?? [tileSourceCenter.lat, tileSourceCenter.lng];

  const center: [number, number] = bases.length > 0
    ? [bases.reduce((s, b) => s + b.lat, 0) / bases.length, bases.reduce((s, b) => s + b.lng, 0) / bases.length]
    : userLocation;

  useEffect(() => {
    if (bases.length > 0 && mapRef.current && !fittedRef.current) {
      const bounds = computeBounds(bases);
      if (bounds) {
        mapRef.current.fitBounds(bounds, { padding: 40, maxZoom: 16 });
        fittedRef.current = true;
      }
    }
  }, [bases]);

  const connectionsGeoJson: GeoJSON | null = connections && connections.length > 0
    ? {
        type: "FeatureCollection",
        features: connections.map((conn) => {
          const from = bases.find((b) => b.id === conn.fromBaseId);
          const to = bases.find((b) => b.id === conn.toBaseId);
          if (!from || !to) return null;
          return {
            type: "Feature" as const,
            properties: {},
            geometry: {
              type: "LineString" as const,
              coordinates: [[from.lng, from.lat], [to.lng, to.lat]],
            },
          };
        }).filter(Boolean) as GeoJSON.Feature[],
      }
    : null;

  return (
    <div className={className}>
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: center[1], latitude: center[0], zoom: 14 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle={getResolvedStyleUrl(tileSource, dark)}
      >
        {bases.map((base) => (
          <Marker
            key={base.id}
            longitude={base.lng}
            latitude={base.lat}
            anchor="bottom"
            onClick={(e) => { e.originalEvent.stopPropagation(); setPopup(base); }}
          >
            <PinMarkerSvg color="#3b82f6" />
          </Marker>
        ))}

        {connectionsGeoJson && (
          <Source id="connections" type="geojson" data={connectionsGeoJson}>
            <Layer
              id="connection-lines"
              type="line"
              paint={{ "line-color": "#6b7280", "line-width": 2, "line-opacity": 0.5, "line-dasharray": [8, 8] }}
            />
          </Source>
        )}

        {popup && (
          <Marker longitude={popup.lng} latitude={popup.lat} anchor="bottom">
            <div
              className="bg-white rounded-lg shadow-lg p-3 min-w-[200px] max-w-[280px] -translate-y-12"
              onClick={(e) => e.stopPropagation()}
            >
              <button className="absolute top-1 right-1 text-gray-400 hover:text-gray-600 text-xs px-1" onClick={() => setPopup(null)}>x</button>
              <p className="text-sm font-semibold leading-tight">{popup.name}</p>
              {popup.description && (
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{popup.description}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                {popup.lat.toFixed(5)}, {popup.lng.toFixed(5)}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {popup.hidden && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded border border-gray-300 bg-gray-50 text-gray-600">
                    <EyeOff className="h-3 w-3" />
                    {t("bases.hidden")}
                  </span>
                )}
                {popup.fixedChallengeName && (
                  <span className="inline-flex items-center px-1.5 py-0.5 text-xs rounded border border-blue-200 bg-blue-50 text-blue-700 max-w-[160px]">
                    <span className="truncate">{t("bases.fixedChallengeNamed", { challenge: popup.fixedChallengeName })}</span>
                  </span>
                )}
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded border ${
                  popup.nfcLinked
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}>
                  {popup.nfcLinked ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                  {popup.nfcLinked ? t("bases.nfcLinked") : t("bases.nfcNotLinked")}
                </span>
              </div>
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(popup.id)}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 transition-colors"
                >
                  <Pencil className="h-3 w-3" />
                  {t("bases.editBase")}
                </button>
              )}
            </div>
          </Marker>
        )}
      </MapGL>
    </div>
  );
}
