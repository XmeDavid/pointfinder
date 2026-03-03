import { describe, expect, it } from "vitest";
import { getAggregateStatus, parseTimestamp, STATUS_COLORS, STATUS_PRIORITY, computeBounds } from "./map-utils";

describe("STATUS_COLORS", () => {
  it("defines colors for all five statuses", () => {
    expect(Object.keys(STATUS_COLORS)).toHaveLength(5);
    expect(STATUS_COLORS.not_visited).toBeDefined();
    expect(STATUS_COLORS.checked_in).toBeDefined();
    expect(STATUS_COLORS.submitted).toBeDefined();
    expect(STATUS_COLORS.completed).toBeDefined();
    expect(STATUS_COLORS.rejected).toBeDefined();
  });
});

describe("STATUS_PRIORITY", () => {
  it("assigns increasing priority values", () => {
    expect(STATUS_PRIORITY.not_visited).toBeLessThan(STATUS_PRIORITY.checked_in);
    expect(STATUS_PRIORITY.checked_in).toBeLessThan(STATUS_PRIORITY.submitted);
    expect(STATUS_PRIORITY.submitted).toBeLessThan(STATUS_PRIORITY.rejected);
    expect(STATUS_PRIORITY.rejected).toBeLessThan(STATUS_PRIORITY.completed);
  });
});

describe("getAggregateStatus", () => {
  it("returns not_visited for empty progress index", () => {
    const index = new Map();
    expect(getAggregateStatus("base-1", index)).toBe("not_visited");
  });

  it("returns not_visited when base has no entries", () => {
    const index = new Map([["other-base", new Map()]]);
    expect(getAggregateStatus("base-1", index)).toBe("not_visited");
  });

  it("returns the single status when only one team", () => {
    const index = new Map([
      ["base-1", new Map([["team-1", { status: "completed" }]])],
    ]);
    expect(getAggregateStatus("base-1", index)).toBe("completed");
  });

  it("returns lowest priority status across teams", () => {
    const index = new Map([
      [
        "base-1",
        new Map([
          ["team-1", { status: "completed" }],
          ["team-2", { status: "checked_in" }],
        ]),
      ],
    ]);
    expect(getAggregateStatus("base-1", index)).toBe("checked_in");
  });

  it("returns not_visited for empty base map", () => {
    const index = new Map([["base-1", new Map()]]);
    expect(getAggregateStatus("base-1", index)).toBe("not_visited");
  });
});

describe("parseTimestamp", () => {
  it("parses valid ISO 8601 strings", () => {
    const result = parseTimestamp("2026-03-01T12:00:00Z");
    expect(result).toBeGreaterThan(0);
  });

  it("returns 0 for invalid strings", () => {
    expect(parseTimestamp("not-a-date")).toBe(0);
    expect(parseTimestamp("")).toBe(0);
  });
});

describe("computeBounds", () => {
  it("returns null for empty array", () => {
    expect(computeBounds([])).toBeNull();
  });

  it("computes correct bounds for a single point", () => {
    const bounds = computeBounds([{ lat: 47.0, lng: 8.0 }]);
    expect(bounds).toEqual([[8.0, 47.0], [8.0, 47.0]]);
  });

  it("computes correct bounds for multiple points", () => {
    const bounds = computeBounds([
      { lat: 46.0, lng: 7.0 },
      { lat: 48.0, lng: 9.0 },
    ]);
    expect(bounds).toEqual([[7.0, 46.0], [9.0, 48.0]]);
  });
});
