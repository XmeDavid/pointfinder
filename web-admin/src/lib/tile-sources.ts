export type TileSourceKey = "osm" | "swisstopo" | "swisstopo-sat" | "voyager" | "positron";

export const DARK_STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export const TILE_SOURCES: Record<
  TileSourceKey,
  { label: string; styleUrl: string; darkStyleUrl?: string; defaultCenter: { lat: number; lng: number } }
> = {
  osm: {
    label: "OpenStreetMap",
    styleUrl: "https://tiles.openfreemap.org/styles/liberty",
    darkStyleUrl: DARK_STYLE_URL,
    defaultCenter: { lat: 40.08789650218038, lng: -8.869461715221407 },
  },
  voyager: {
    label: "CartoDB Voyager",
    styleUrl: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
    darkStyleUrl: DARK_STYLE_URL,
    defaultCenter: { lat: 40.08789650218038, lng: -8.869461715221407 },
  },
  positron: {
    label: "CartoDB Positron",
    styleUrl: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    darkStyleUrl: DARK_STYLE_URL,
    defaultCenter: { lat: 40.08789650218038, lng: -8.869461715221407 },
  },
  swisstopo: {
    label: "SwissTopo",
    styleUrl: "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.basemap.vt/style.json",
    defaultCenter: { lat: 46.8182, lng: 8.2275 },
  },
  "swisstopo-sat": {
    label: "SwissTopo Satellite",
    styleUrl: "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.imagerybasemap.vt/style.json",
    defaultCenter: { lat: 46.8182, lng: 8.2275 },
  },
};

export function getStyleUrl(key: string | undefined | null): string {
  if (key && key in TILE_SOURCES) {
    return TILE_SOURCES[key as TileSourceKey].styleUrl;
  }
  return TILE_SOURCES.osm.styleUrl;
}

export function getResolvedStyleUrl(key: string | undefined | null, isDark: boolean): string {
  const source = key && key in TILE_SOURCES ? TILE_SOURCES[key as TileSourceKey] : TILE_SOURCES.osm;
  if (isDark && source.darkStyleUrl) {
    return source.darkStyleUrl;
  }
  return source.styleUrl;
}

export function getDefaultCenter(key: string | undefined | null): { lat: number; lng: number } {
  if (key && key in TILE_SOURCES) {
    return TILE_SOURCES[key as TileSourceKey].defaultCenter;
  }
  return TILE_SOURCES.osm.defaultCenter;
}
