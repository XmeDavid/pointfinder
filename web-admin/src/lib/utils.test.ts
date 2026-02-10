import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n", () => ({
  default: {
    language: "en",
  },
}));

import { formatDateTimeInputValue, parseDateTimeInputValue } from "./utils";

describe("formatDateTimeInputValue", () => {
  it("formats date values as dd/mm/yyyy HH:mm", () => {
    const date = new Date(2026, 1, 10, 14, 5);
    expect(formatDateTimeInputValue(date)).toBe("10/02/2026 14:05");
  });

  it("returns empty string for null and invalid values", () => {
    expect(formatDateTimeInputValue(null)).toBe("");
    expect(formatDateTimeInputValue("not-a-date")).toBe("");
  });
});

describe("parseDateTimeInputValue", () => {
  it("parses dd/mm/yyyy HH:mm into a local Date", () => {
    const parsed = parseDateTimeInputValue("10/02/2026 14:05");
    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(1);
    expect(parsed?.getDate()).toBe(10);
    expect(parsed?.getHours()).toBe(14);
    expect(parsed?.getMinutes()).toBe(5);
  });

  it("returns null for invalid formats and impossible dates", () => {
    expect(parseDateTimeInputValue("2026-02-10 14:05")).toBeNull();
    expect(parseDateTimeInputValue("31/02/2026 14:05")).toBeNull();
    expect(parseDateTimeInputValue("10/13/2026 14:05")).toBeNull();
    expect(parseDateTimeInputValue("10/02/2026 25:00")).toBeNull();
  });
});
