import { describe, it, expect } from "vitest";
import { TILE_SOURCES, getStyleUrl, getResolvedStyleUrl, getDefaultCenter } from "../tile-sources";
import type { TileSourceKey } from "../tile-sources";

const EXPECTED_KEYS: TileSourceKey[] = [
  "osm",
  "osm-classic",
  "voyager",
  "positron",
  "swisstopo",
  "swisstopo-sat",
];

describe("TILE_SOURCES", () => {
  it("contains exactly the 6 expected tile source keys", () => {
    expect(Object.keys(TILE_SOURCES).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it("every entry has a label and styleUrl", () => {
    for (const key of EXPECTED_KEYS) {
      const source = TILE_SOURCES[key];
      expect(source.label).toBeTruthy();
      expect(source.styleUrl).toBeTruthy();
    }
  });

  it("labels match expected display names", () => {
    expect(TILE_SOURCES["osm"].label).toBe("OpenStreetMap");
    expect(TILE_SOURCES["osm-classic"].label).toBe("OpenStreetMap Classic");
    expect(TILE_SOURCES["voyager"].label).toBe("CartoDB Voyager");
    expect(TILE_SOURCES["positron"].label).toBe("CartoDB Positron");
    expect(TILE_SOURCES["swisstopo"].label).toBe("SwissTopo");
    expect(TILE_SOURCES["swisstopo-sat"].label).toBe("SwissTopo Satellite");
  });
});

describe("getStyleUrl", () => {
  it("returns the style URL for a valid key", () => {
    expect(getStyleUrl("voyager")).toBe(
      "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
    );
  });

  it("falls back to osm-classic for unknown key", () => {
    expect(getStyleUrl("unknown")).toBe(getStyleUrl("osm-classic"));
  });

  it("falls back to osm-classic for null/undefined", () => {
    expect(getStyleUrl(null)).toBe(getStyleUrl("osm-classic"));
    expect(getStyleUrl(undefined)).toBe(getStyleUrl("osm-classic"));
  });
});

describe("getResolvedStyleUrl", () => {
  it("returns dark style URL when isDark and darkStyleUrl exists", () => {
    const url = getResolvedStyleUrl("osm", true);
    expect(url).toContain("dark-matter");
  });

  it("returns normal style URL when isDark but no darkStyleUrl", () => {
    const url = getResolvedStyleUrl("swisstopo", true);
    expect(url).not.toContain("dark-matter");
  });

  it("returns normal style URL when not dark", () => {
    const url = getResolvedStyleUrl("osm", false);
    expect(url).not.toContain("dark-matter");
  });
});

describe("getDefaultCenter", () => {
  it("returns default center for valid key", () => {
    const center = getDefaultCenter("swisstopo");
    expect(center.lat).toBeCloseTo(46.8182, 2);
    expect(center.lng).toBeCloseTo(8.2275, 2);
  });

  it("falls back to osm-classic center for unknown key", () => {
    const center = getDefaultCenter("unknown");
    expect(center).toEqual(getDefaultCenter("osm-classic"));
  });
});
