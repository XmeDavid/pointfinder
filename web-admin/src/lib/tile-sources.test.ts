import { describe, expect, it } from "vitest";
import { getStyleUrl, TILE_SOURCES, DARK_STYLE_URL } from "./tile-sources";

describe("TILE_SOURCES", () => {
  it("defines all three tile sources", () => {
    expect(Object.keys(TILE_SOURCES)).toHaveLength(3);
    expect(TILE_SOURCES.osm).toBeDefined();
    expect(TILE_SOURCES.swisstopo).toBeDefined();
    expect(TILE_SOURCES["swisstopo-sat"]).toBeDefined();
  });

  it("each source has a label and styleUrl", () => {
    for (const [, source] of Object.entries(TILE_SOURCES)) {
      expect(source.label).toBeTruthy();
      expect(source.styleUrl).toMatch(/^https:\/\//);
    }
  });
});

describe("DARK_STYLE_URL", () => {
  it("is a valid HTTPS URL", () => {
    expect(DARK_STYLE_URL).toMatch(/^https:\/\//);
  });
});

describe("getStyleUrl", () => {
  it("returns OSM style for 'osm'", () => {
    expect(getStyleUrl("osm")).toBe(TILE_SOURCES.osm.styleUrl);
  });

  it("returns SwissTopo style for 'swisstopo'", () => {
    expect(getStyleUrl("swisstopo")).toBe(TILE_SOURCES.swisstopo.styleUrl);
  });

  it("returns SwissTopo satellite style for 'swisstopo-sat'", () => {
    expect(getStyleUrl("swisstopo-sat")).toBe(TILE_SOURCES["swisstopo-sat"].styleUrl);
  });

  it("falls back to OSM for unknown keys", () => {
    expect(getStyleUrl("unknown")).toBe(TILE_SOURCES.osm.styleUrl);
  });

  it("falls back to OSM for null/undefined", () => {
    expect(getStyleUrl(null)).toBe(TILE_SOURCES.osm.styleUrl);
    expect(getStyleUrl(undefined)).toBe(TILE_SOURCES.osm.styleUrl);
  });
});
