/**
 * Unit tests for the client-side tag filter aggregation and AND-semantics
 * filtering logic used in BasesPage, ChallengesPage, and BasesAndChallengesView.
 *
 * Wave B update: the color dimension has been removed. Tags are now game-scoped
 * entities (UUIDs). Filtering operates on tagIds only.
 *
 * Semantics:
 *   - Tags dimension: AND — item must have ALL selected tag IDs.
 *
 * Tag-matching conventions:
 *   - Tag IDs are UUIDs — exact string match, no trimming needed.
 *   - Duplicate tagIds on a single item are deduplicated per-item before
 *     contributing to global counts.
 */
import { describe, it, expect } from "vitest";
import type { Base, Challenge } from "@/types";

// ---------------------------------------------------------------------------
// Helpers that mirror the in-component logic (extracted here for testability)
// ---------------------------------------------------------------------------

function aggregateTags<T extends { tagIds?: string[] }>(items: T[]) {
  const tagMap = new Map<string, number>();
  for (const item of items) {
    const uniqueItemTagIds = new Set(item.tagIds ?? []);
    for (const tagId of uniqueItemTagIds) {
      tagMap.set(tagId, (tagMap.get(tagId) ?? 0) + 1);
    }
  }
  return {
    allTagIds: Array.from(tagMap.keys()),
    tagCounts: tagMap,
  };
}

/**
 * applyFilter — AND semantics for tagIds.
 * Item must have ALL selected tagIds.
 */
function applyFilter<T extends { tagIds?: string[] }>(
  items: T[],
  selectedTagIds: string[],
): T[] {
  if (selectedTagIds.length === 0) return items;
  return items.filter((item) => {
    const itemTagIds = item.tagIds ?? [];
    return selectedTagIds.every((id) => itemTagIds.includes(id));
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TAG_MORNING = "tag-uuid-morning";
const TAG_STAFFED = "tag-uuid-staffed";
const TAG_AUTONOMOUS = "tag-uuid-autonomous";
const TAG_AFTERNOON = "tag-uuid-afternoon";
const TAG_OUTDOOR = "tag-uuid-outdoor";

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
// aggregateTags
// ---------------------------------------------------------------------------

describe("aggregateTags", () => {
  it("returns empty map for items with no tagIds", () => {
    const result = aggregateTags([makeBase("b1"), makeBase("b2")]);
    expect(result.allTagIds).toEqual([]);
  });

  it("collects all distinct tag IDs with counts", () => {
    const items = [
      makeBase("b1", { tagIds: [TAG_STAFFED, TAG_MORNING] }),
      makeBase("b2", { tagIds: [TAG_AUTONOMOUS, TAG_MORNING] }),
      makeBase("b3", { tagIds: [TAG_AUTONOMOUS] }),
    ];
    const { allTagIds, tagCounts } = aggregateTags(items);
    expect(allTagIds).toContain(TAG_AUTONOMOUS);
    expect(allTagIds).toContain(TAG_MORNING);
    expect(allTagIds).toContain(TAG_STAFFED);
    expect(tagCounts.get(TAG_AUTONOMOUS)).toBe(2);
    expect(tagCounts.get(TAG_MORNING)).toBe(2);
    expect(tagCounts.get(TAG_STAFFED)).toBe(1);
  });

  it("works with Challenge objects (same generic shape)", () => {
    const items = [
      makeChallenge("c1", { tagIds: [TAG_AUTONOMOUS] }),
      makeChallenge("c2", { tagIds: [TAG_STAFFED] }),
    ];
    const { allTagIds } = aggregateTags(items);
    expect(allTagIds).toContain(TAG_AUTONOMOUS);
    expect(allTagIds).toContain(TAG_STAFFED);
  });

  it("does not double-count duplicate tagIds on a single item", () => {
    const items = [
      makeBase("b1", { tagIds: [TAG_MORNING, TAG_MORNING] }),
      makeBase("b2", { tagIds: [TAG_MORNING] }),
    ];
    const { tagCounts } = aggregateTags(items);
    // b1 contributes 1 (not 2) because duplicates are collapsed per-item.
    // b2 contributes 1. Total: 2.
    expect(tagCounts.get(TAG_MORNING)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// applyFilter — AND semantics for tagIds
// ---------------------------------------------------------------------------

describe("applyFilter — tagIds AND semantics", () => {
  const bases = [
    makeBase("b1", { tagIds: [TAG_AUTONOMOUS, TAG_MORNING] }),
    makeBase("b2", { tagIds: [TAG_STAFFED, TAG_MORNING] }),
    makeBase("b3", { tagIds: [TAG_AUTONOMOUS, TAG_AFTERNOON] }),
    makeBase("b4"),
  ];

  it("returns all items when no filters are selected", () => {
    expect(applyFilter(bases, [])).toHaveLength(4);
  });

  it("filters to items matching a single tag ID", () => {
    const result = applyFilter(bases, [TAG_AUTONOMOUS]);
    expect(result.map((b) => b.id)).toEqual(["b1", "b3"]);
  });

  it("uses AND semantics: shows only items matching ALL selected tag IDs", () => {
    // morning + staffed → only b2 has both
    const result = applyFilter(bases, [TAG_MORNING, TAG_STAFFED]);
    expect(result.map((b) => b.id)).toEqual(["b2"]);
    // b1 has morning but NOT staffed → excluded
    expect(result.map((b) => b.id)).not.toContain("b1");
    // b3 has neither morning nor staffed → excluded
    expect(result.map((b) => b.id)).not.toContain("b3");
  });

  it("excludes items with no tagIds when a tag is selected", () => {
    const result = applyFilter(bases, [TAG_MORNING]);
    expect(result.map((b) => b.id)).not.toContain("b4");
  });

  it("morning+staffed scenario: only the item with BOTH tags matches", () => {
    const bases2 = [
      makeBase("b1", { tagIds: [TAG_MORNING, TAG_STAFFED] }),
      makeBase("b2", { tagIds: [TAG_MORNING] }),   // morning only — no match
      makeBase("b3", { tagIds: [TAG_STAFFED] }),   // staffed only — no match
      makeBase("b4"),                               // no tags — no match
    ];
    const result = applyFilter(bases2, [TAG_MORNING, TAG_STAFFED]);
    expect(result.map((b) => b.id)).toEqual(["b1"]);
  });
});

// ---------------------------------------------------------------------------
// applyFilter — EITHER-side pair match (BasesAndChallengesView semantics)
// ---------------------------------------------------------------------------

describe("applyFilter — EITHER-side pair semantics", () => {
  it("matches a pair if the challenge has the tag even when base does not", () => {
    // Simulate pairFilterItems shape: { tagIds: merged base+challenge tagIds }
    const pairs = [
      { id: "p1", tagIds: [TAG_OUTDOOR] },   // challenge provides TAG_OUTDOOR
      { id: "p2", tagIds: [] },
    ];
    const result = applyFilter(pairs, [TAG_OUTDOOR]);
    expect(result.map((p) => p.id)).toEqual(["p1"]);
  });
});
