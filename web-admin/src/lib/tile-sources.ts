export type TileSourceKey = "osm" | "swisstopo" | "swisstopo-sat";

export const TILE_SOURCES: Record<TileSourceKey, { label: string; styleUrl: string }> = {
  osm: {
    label: "OpenStreetMap",
    styleUrl: "https://tiles.openfreemap.org/styles/liberty",
  },
  swisstopo: {
    label: "SwissTopo",
    styleUrl: "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.basemap.vt/style.json",
  },
  "swisstopo-sat": {
    label: "SwissTopo Satellite",
    styleUrl: "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.imagerybasemap.vt/style.json",
  },
};

export const DARK_STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export function getStyleUrl(key: string | undefined | null): string {
  if (key && key in TILE_SOURCES) {
    return TILE_SOURCES[key as TileSourceKey].styleUrl;
  }
  return TILE_SOURCES.osm.styleUrl;
}
