import { describe, expect, it } from "vitest";
import { getStyleUrl, getResolvedStyleUrl, getDefaultCenter, TILE_SOURCES, DARK_STYLE_URL } from "./tile-sources";

describe("TILE_SOURCES", () => {
  it("defines all six tile sources", () => {
    expect(Object.keys(TILE_SOURCES)).toHaveLength(6);
    expect(TILE_SOURCES.osm).toBeDefined();
    expect(TILE_SOURCES["osm-classic"]).toBeDefined();
    expect(TILE_SOURCES.voyager).toBeDefined();
    expect(TILE_SOURCES.positron).toBeDefined();
    expect(TILE_SOURCES.swisstopo).toBeDefined();
    expect(TILE_SOURCES["swisstopo-sat"]).toBeDefined();
  });

  it("each source has a label, styleUrl, and defaultCenter", () => {
    for (const [, source] of Object.entries(TILE_SOURCES)) {
      expect(source.label).toBeTruthy();
      expect(source.styleUrl).toBeTruthy();
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

describe("getResolvedStyleUrl", () => {
  it("returns dark style when isDark=true and source has darkStyleUrl", () => {
    expect(getResolvedStyleUrl("osm", true)).toBe(DARK_STYLE_URL);
    expect(getResolvedStyleUrl("voyager", true)).toBe(DARK_STYLE_URL);
    expect(getResolvedStyleUrl("positron", true)).toBe(DARK_STYLE_URL);
  });

  it("returns light style when isDark=true but source has no dark variant", () => {
    expect(getResolvedStyleUrl("swisstopo", true)).toBe(TILE_SOURCES.swisstopo.styleUrl);
    expect(getResolvedStyleUrl("swisstopo-sat", true)).toBe(TILE_SOURCES["swisstopo-sat"].styleUrl);
    expect(getResolvedStyleUrl("osm-classic", true)).toBe(TILE_SOURCES["osm-classic"].styleUrl);
  });

  it("returns light style when isDark=false", () => {
    expect(getResolvedStyleUrl("osm", false)).toBe(TILE_SOURCES.osm.styleUrl);
    expect(getResolvedStyleUrl("voyager", false)).toBe(TILE_SOURCES.voyager.styleUrl);
    expect(getResolvedStyleUrl("positron", false)).toBe(TILE_SOURCES.positron.styleUrl);
    expect(getResolvedStyleUrl("swisstopo", false)).toBe(TILE_SOURCES.swisstopo.styleUrl);
  });

  it("handles null/undefined by falling back to OSM", () => {
    expect(getResolvedStyleUrl(null, false)).toBe(TILE_SOURCES.osm.styleUrl);
    expect(getResolvedStyleUrl(undefined, false)).toBe(TILE_SOURCES.osm.styleUrl);
    expect(getResolvedStyleUrl(null, true)).toBe(DARK_STYLE_URL);
    expect(getResolvedStyleUrl(undefined, true)).toBe(DARK_STYLE_URL);
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
