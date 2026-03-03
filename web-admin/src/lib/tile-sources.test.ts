import { describe, expect, it } from "vitest";
import { getStyleUrl, getDefaultCenter, TILE_SOURCES, DARK_STYLE_URL } from "./tile-sources";

describe("TILE_SOURCES", () => {
  it("defines all three tile sources", () => {
    expect(Object.keys(TILE_SOURCES)).toHaveLength(3);
    expect(TILE_SOURCES.osm).toBeDefined();
    expect(TILE_SOURCES.swisstopo).toBeDefined();
    expect(TILE_SOURCES["swisstopo-sat"]).toBeDefined();
  });

  it("each source has a label, styleUrl, and defaultCenter", () => {
    for (const [, source] of Object.entries(TILE_SOURCES)) {
      expect(source.label).toBeTruthy();
      expect(source.styleUrl).toMatch(/^https:\/\//);
      expect(source.defaultCenter.lat).toBeTypeOf("number");
      expect(source.defaultCenter.lng).toBeTypeOf("number");
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

describe("getDefaultCenter", () => {
  it("returns Switzerland center for swisstopo", () => {
    const center = getDefaultCenter("swisstopo");
    expect(center.lat).toBeCloseTo(46.8, 0);
    expect(center.lng).toBeCloseTo(8.2, 0);
  });

  it("returns Switzerland center for swisstopo-sat", () => {
    const center = getDefaultCenter("swisstopo-sat");
    expect(center).toEqual(getDefaultCenter("swisstopo"));
  });

  it("returns Portugal center for osm", () => {
    const center = getDefaultCenter("osm");
    expect(center).toEqual(TILE_SOURCES.osm.defaultCenter);
  });

  it("falls back to OSM for null/undefined/unknown", () => {
    expect(getDefaultCenter(null)).toEqual(TILE_SOURCES.osm.defaultCenter);
    expect(getDefaultCenter(undefined)).toEqual(TILE_SOURCES.osm.defaultCenter);
    expect(getDefaultCenter("unknown")).toEqual(TILE_SOURCES.osm.defaultCenter);
  });
});
