/**
 * Unit tests for the client-side tag/color filter aggregation and AND-semantics
 * filtering logic used in BasesPage, ChallengesPage, and BasesAndChallengesView.
 *
 * Semantics (as of Fix 2 in the Wave 3a fix pass):
 *   - Tags dimension:   AND — item must have ALL selected tags.
 *   - Colors dimension: OR  — item's color must match ANY selected color.
 *   - Cross-dimension:  AND — item must pass both the tag predicate AND
 *                             the color predicate.
 *
 * Tag-matching conventions (documented here so future devs don't guess):
 *   - Case-sensitive: "Morning" does NOT match filter "morning".
 *     Rationale: operators create and filter their own tags; forcing a
 *     case-insensitive normalisation would silently merge "NFC" and "nfc" etc.
 *     If case-folding is ever needed, normalise at save-time instead.
 *   - Whitespace-padded tags are trimmed during aggregation in useTagColorFilter.
 *     The filter array (from URL params) is also trimmed on decode.
 *     So "  morning  " stored on an item is treated as "morning" for both
 *     aggregation and matching.
 *   - Duplicate tags on a single item are deduplicated per-item before
 *     contributing to global counts.
 */
import { describe, it, expect } from "vitest";
import type { Base, Challenge } from "@/types";

// ---------------------------------------------------------------------------
// Helpers that mirror the in-component logic (extracted here for testability)
// ---------------------------------------------------------------------------

function aggregateTagsAndColors<T extends { tags?: string[]; color?: string }>(items: T[]) {
  const tagMap = new Map<string, number>();
  const colorMap = new Map<string, number>();
  for (const item of items) {
    // Deduplicate per-item tags before counting
    const uniqueItemTags = new Set(
      (item.tags ?? []).map((t) => t.trim()).filter(Boolean),
    );
    for (const tag of uniqueItemTags) {
      tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
    }
    if (item.color) {
      colorMap.set(item.color, (colorMap.get(item.color) ?? 0) + 1);
    }
  }
  return {
    allTags: Array.from(tagMap.keys()).sort(),
    // Colors sorted alphabetically by hex for stable render order
    allColors: Array.from(colorMap.keys()).sort(),
    tagCounts: tagMap,
    colorCounts: colorMap,
  };
}

/**
 * applyFilter — AND semantics within tags, OR within colors, AND across.
 *
 * This replaces the old `applyOrFilter` (which used OR for tags).
 * Use case: operator selects "morning" + "staffed" → expects ONLY
 * morning-AND-staffed bases. A base tagged only ["morning"] does NOT match.
 */
function applyFilter<T extends { tags?: string[]; color?: string }>(
  items: T[],
  selectedTags: string[],
  selectedColors: string[],
): T[] {
  if (selectedTags.length === 0 && selectedColors.length === 0) return items;
  return items.filter((item) => {
    const itemTags = (item.tags ?? []).map((t) => t.trim());
    // Tags: AND — item must have ALL selected tags
    const tagPass =
      selectedTags.length === 0 || selectedTags.every((st) => itemTags.includes(st));
    // Colors: OR — item's color must match ANY selected color
    const colorPass =
      selectedColors.length === 0 ||
      (item.color !== undefined && selectedColors.includes(item.color));
    // Cross-dimension: AND
    return tagPass && colorPass;
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBase(id: string, overrides: Partial<Base> = {}): Base {
  return {
    id,
    gameId: "g1",
    name: `Base ${id}`,
    description: "",
    lat: 0,
    lng: 0,
    nfcLinked: false,
    hidden: false,
    ...overrides,
  };
}

function makeChallenge(id: string, overrides: Partial<Challenge> = {}): Challenge {
  return {
    id,
    gameId: "g1",
    title: `Challenge ${id}`,
    description: "",
    content: "",
    completionContent: "",
    answerType: "text",
    autoValidate: false,
    points: 100,
    locationBound: false,
    requirePresenceToSubmit: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// aggregateTagsAndColors
// ---------------------------------------------------------------------------

describe("aggregateTagsAndColors", () => {
  it("returns empty arrays for items with no tags or colors", () => {
    const result = aggregateTagsAndColors([makeBase("b1"), makeBase("b2")]);
    expect(result.allTags).toEqual([]);
    expect(result.allColors).toEqual([]);
  });

  it("collects all distinct tags sorted alphabetically", () => {
    const items = [
      makeBase("b1", { tags: ["staffed", "morning"] }),
      makeBase("b2", { tags: ["autonomous", "morning"] }),
      makeBase("b3", { tags: ["autonomous"] }),
    ];
    const { allTags, tagCounts } = aggregateTagsAndColors(items);
    expect(allTags).toEqual(["autonomous", "morning", "staffed"]);
    expect(tagCounts.get("autonomous")).toBe(2);
    expect(tagCounts.get("morning")).toBe(2);
    expect(tagCounts.get("staffed")).toBe(1);
  });

  it("collects all distinct colors with counts", () => {
    const items = [
      makeBase("b1", { color: "#ff0000" }),
      makeBase("b2", { color: "#ff0000" }),
      makeBase("b3", { color: "#00ff00" }),
      makeBase("b4"),
    ];
    const { allColors, colorCounts } = aggregateTagsAndColors(items);
    expect(allColors).toContain("#ff0000");
    expect(allColors).toContain("#00ff00");
    expect(colorCounts.get("#ff0000")).toBe(2);
    expect(colorCounts.get("#00ff00")).toBe(1);
    expect(allColors).not.toContain(undefined);
  });

  it("works with Challenge objects (same generic shape)", () => {
    const items = [
      makeChallenge("c1", { tags: ["autonomous"], color: "#3b82f6" }),
      makeChallenge("c2", { tags: ["staffed"] }),
    ];
    const { allTags, allColors } = aggregateTagsAndColors(items);
    expect(allTags).toEqual(["autonomous", "staffed"]);
    expect(allColors).toEqual(["#3b82f6"]);
  });

  // Edge case (a): duplicate tags on a single item must not double-count.
  it("does not double-count duplicate tags on a single item", () => {
    const items = [
      makeBase("b1", { tags: ["morning", "morning"] }),
      makeBase("b2", { tags: ["morning"] }),
    ];
    const { tagCounts } = aggregateTagsAndColors(items);
    // b1 contributes 1 (not 2) because duplicates are collapsed per-item.
    // b2 contributes 1. Total: 2.
    expect(tagCounts.get("morning")).toBe(2);
  });

  // Edge case (b): case sensitivity — "Morning" and "morning" are distinct.
  it("treats tag casing as distinct (case-sensitive)", () => {
    const items = [
      makeBase("b1", { tags: ["Morning"] }),
      makeBase("b2", { tags: ["morning"] }),
    ];
    const { allTags, tagCounts } = aggregateTagsAndColors(items);
    expect(allTags).toContain("Morning");
    expect(allTags).toContain("morning");
    expect(tagCounts.get("Morning")).toBe(1);
    expect(tagCounts.get("morning")).toBe(1);
  });

  // Edge case (c): whitespace-padded tags are trimmed during aggregation.
  it("trims whitespace-padded tags during aggregation", () => {
    const items = [
      makeBase("b1", { tags: [" morning ", "staffed"] }),
      makeBase("b2", { tags: ["morning"] }),
    ];
    const { allTags, tagCounts } = aggregateTagsAndColors(items);
    // " morning " trims to "morning", so should merge with b2's "morning"
    expect(allTags).toContain("morning");
    expect(tagCounts.get("morning")).toBe(2);
    // No raw " morning " entry in the map
    expect(tagCounts.has(" morning ")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyFilter — AND semantics for tags
// ---------------------------------------------------------------------------

describe("applyFilter — tags only (AND semantics)", () => {
  const bases = [
    makeBase("b1", { tags: ["autonomous", "morning"] }),
    makeBase("b2", { tags: ["staffed", "morning"] }),
    makeBase("b3", { tags: ["autonomous", "afternoon"] }),
    makeBase("b4"),
  ];

  it("returns all items when no filters are selected", () => {
    expect(applyFilter(bases, [], [])).toHaveLength(4);
  });

  it("filters to items matching a single tag", () => {
    const result = applyFilter(bases, ["autonomous"], []);
    expect(result.map((b) => b.id)).toEqual(["b1", "b3"]);
  });

  it("uses AND semantics: shows only items matching ALL selected tags", () => {
    // morning + staffed → only b2 has both
    const result = applyFilter(bases, ["morning", "staffed"], []);
    expect(result.map((b) => b.id)).toEqual(["b2"]);
    // b1 has morning but NOT staffed → excluded
    expect(result.map((b) => b.id)).not.toContain("b1");
    // b3 has neither morning nor staffed → excluded
    expect(result.map((b) => b.id)).not.toContain("b3");
  });

  it("excludes items with no tags when a tag is selected", () => {
    const result = applyFilter(bases, ["morning"], []);
    expect(result.map((b) => b.id)).not.toContain("b4");
  });

  // The key use-case walk: morning AND staffed → only b2
  it("morning+staffed scenario: only the item with BOTH tags matches", () => {
    const bases2 = [
      makeBase("b1", { tags: ["morning", "staffed"] }),
      makeBase("b2", { tags: ["morning"] }),             // morning only — no match
      makeBase("b3", { tags: ["staffed"] }),             // staffed only — no match
      makeBase("b4"),                                     // no tags — no match
    ];
    const result = applyFilter(bases2, ["morning", "staffed"], []);
    expect(result.map((b) => b.id)).toEqual(["b1"]);
  });
});

// ---------------------------------------------------------------------------
// applyFilter — color-only scenarios (OR within colors)
// ---------------------------------------------------------------------------

describe("applyFilter — colors only", () => {
  const bases = [
    makeBase("b1", { color: "#ff0000" }),
    makeBase("b2", { color: "#00ff00" }),
    makeBase("b3", { color: "#ff0000" }),
    makeBase("b4"),
  ];

  it("filters to items matching a single color", () => {
    const result = applyFilter(bases, [], ["#ff0000"]);
    expect(result.map((b) => b.id)).toEqual(["b1", "b3"]);
  });

  it("uses OR semantics across colors (an item has only one color)", () => {
    const result = applyFilter(bases, [], ["#ff0000", "#00ff00"]);
    expect(result.map((b) => b.id)).toEqual(["b1", "b2", "b3"]);
  });

  it("excludes items with no color when a color is selected", () => {
    const result = applyFilter(bases, [], ["#ff0000"]);
    expect(result.map((b) => b.id)).not.toContain("b4");
  });
});

// ---------------------------------------------------------------------------
// applyFilter — combined tag + color (AND across dimensions)
// ---------------------------------------------------------------------------

describe("applyFilter — combined tags and colors (AND across dimensions)", () => {
  const bases = [
    makeBase("b1", { tags: ["autonomous", "morning"], color: "#ff0000" }),
    makeBase("b2", { tags: ["staffed", "morning"], color: "#00ff00" }),
    makeBase("b3", { tags: ["morning"] }),
    makeBase("b4", { color: "#ff0000" }),
    makeBase("b5"),
  ];

  it("shows only items that satisfy BOTH tag predicate AND color predicate", () => {
    // Select tag "morning" AND color "#ff0000"
    // b1: has "morning" (AND tag passes) AND color "#ff0000" (color passes) → MATCH
    // b2: has "morning" (AND tag passes) but color "#00ff00" ≠ "#ff0000" → NO MATCH
    // b3: has "morning" but no color → color fails → NO MATCH
    // b4: has color "#ff0000" but no "morning" tag → tag fails → NO MATCH
    // b5: neither → NO MATCH
    const result = applyFilter(bases, ["morning"], ["#ff0000"]);
    expect(result.map((b) => b.id)).toEqual(["b1"]);
  });

  it("b4 does NOT appear when a tag is also required but b4 has no tags", () => {
    const result = applyFilter(bases, ["autonomous"], ["#ff0000"]);
    // b1: tag "autonomous" ✓ AND color "#ff0000" ✓ → match
    // b4: no "autonomous" tag → tag fails → no match
    expect(result.map((b) => b.id)).toEqual(["b1"]);
    expect(result.map((b) => b.id)).not.toContain("b4");
  });

  it("with no tags selected, color filter alone works (cross-dimension AND is trivially satisfied)", () => {
    const result = applyFilter(bases, [], ["#ff0000"]);
    // b1 and b4 have color "#ff0000"
    expect(result.map((b) => b.id)).toContain("b1");
    expect(result.map((b) => b.id)).toContain("b4");
  });
});
