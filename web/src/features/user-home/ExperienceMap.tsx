import { useCallback, useEffect, useState } from "react";
import { AttributionControl, Marker, type MapRef } from "react-map-gl/maplibre";
import { GameMap } from "@/components/map/GameMap";
import { StatusMarker } from "@/components/map/StatusMarker";
import { getResolvedStyleUrl } from "@/components/map/tileSources";
import type { ExploreGameResponse } from "@pointfinder/api";

/** Shared map and semantic markers, with published locations only. */
export function ExperienceMap({
  games,
  selectedId,
  onSelect,
  center = [-8.85, 40.086],
  zoom = 11,
}: {
  games: ExploreGameResponse[];
  selectedId?: string;
  onSelect: (game: ExploreGameResponse) => void;
  center?: [number, number];
  zoom?: number;
}) {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  const [map, setMap] = useState<MapRef | null>(null);
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains("dark")),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);
  const handleMap = useCallback((ref: MapRef | null) => setMap(ref), []);
  const [longitude, latitude] = center;
  useEffect(() => {
    map?.jumpTo({ center: [longitude, latitude], zoom });
  }, [map, longitude, latitude, zoom]); // Center changes come from explicit location selection.
  return (
    <GameMap
      initialCenter={center}
      initialZoom={zoom}
      mapStyle={getResolvedStyleUrl("voyager", dark)}
      onMapRef={handleMap}
    >
      <AttributionControl position="bottom-left" compact />
      {games
        .filter((game) => game.lat !== null && game.lng !== null)
        .map((game) => (
          <Marker
            key={game.gameId}
            longitude={game.lng!}
            latitude={game.lat!}
            anchor="center"
          >
            <button
              type="button"
              className="ex-map-pin"
              aria-label={game.title}
              aria-pressed={selectedId === game.gameId}
              onClick={() => onSelect(game)}
            >
              <StatusMarker
                tone="info"
                size={selectedId === game.gameId ? 22 : 16}
                selected={selectedId === game.gameId}
                label={game.place}
              />
            </button>
          </Marker>
        ))}
    </GameMap>
  );
}
