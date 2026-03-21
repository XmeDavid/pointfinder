import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n", () => ({
  default: {
    language: "en",
  },
}));

import { formatDateTimeInputValue, parseDateTimeInputValue } from "./utils";

describe("formatDateTimeInputValue", () => {
  it("formats date values as dd/mm/yyyy HH:mm with timezone", () => {
    const date = new Date(2026, 1, 10, 14, 5);
    const result = formatDateTimeInputValue(date);
    expect(result).toMatch(/^10\/02\/2026 14:05 \(UTC[+-]\d{2}:\d{2}\)$/);
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

  it("returns null for empty and whitespace-only input", () => {
    expect(parseDateTimeInputValue("")).toBeNull();
    expect(parseDateTimeInputValue("   ")).toBeNull();
  });

  it("handles midnight correctly", () => {
    const parsed = parseDateTimeInputValue("01/01/2026 00:00");
    expect(parsed).not.toBeNull();
    expect(parsed?.getHours()).toBe(0);
    expect(parsed?.getMinutes()).toBe(0);
  });

  it("handles end-of-day time 23:59", () => {
    const parsed = parseDateTimeInputValue("31/12/2025 23:59");
    expect(parsed).not.toBeNull();
    expect(parsed?.getHours()).toBe(23);
    expect(parsed?.getMinutes()).toBe(59);
  });

  it("rejects minute value of 60", () => {
    expect(parseDateTimeInputValue("10/02/2026 14:60")).toBeNull();
  });

  it("handles leap year Feb 29", () => {
    const parsed = parseDateTimeInputValue("29/02/2028 12:00");
    expect(parsed).not.toBeNull();
    expect(parsed?.getDate()).toBe(29);
    expect(parsed?.getMonth()).toBe(1);
  });

  it("rejects Feb 29 on non-leap year", () => {
    expect(parseDateTimeInputValue("29/02/2026 12:00")).toBeNull();
  });

  it("rejects day 0", () => {
    expect(parseDateTimeInputValue("00/01/2026 12:00")).toBeNull();
  });

  it("rejects month 0", () => {
    expect(parseDateTimeInputValue("15/00/2026 12:00")).toBeNull();
  });
});
