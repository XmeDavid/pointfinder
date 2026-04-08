/**
 * Fixed 12-swatch color palette used by the operator workflow
 * (P1 Phase 4 W3 — tags and colors on bases and challenges).
 *
 * The backend accepts any valid 7-char hex via a `@Pattern` regex on the
 * request DTO; the palette is enforced client-side only, to keep the
 * operator UI visually consistent and accessible. Swatch colors are a
 * curated subset of Tailwind's `*-500` hues plus a neutral slate.
 *
 * Storage format matches the existing `Team.color` convention:
 * `VARCHAR(7)` lowercase hex.
 *
 * Privacy: both `Base.color` and `Challenge.color` are operator-only
 * metadata and are never exposed to players. See
 * `docs/business-logic.md` § "Tags and Colors on Bases and Challenges".
 */
export interface ColorSwatch {
  value: string;
  nameKey: string;
}

export const COLOR_PALETTE: ColorSwatch[] = [
  { value: "#ef4444", nameKey: "color.red" },
  { value: "#f97316", nameKey: "color.orange" },
  { value: "#f59e0b", nameKey: "color.amber" },
  { value: "#eab308", nameKey: "color.yellow" },
  { value: "#84cc16", nameKey: "color.lime" },
  { value: "#22c55e", nameKey: "color.green" },
  { value: "#14b8a6", nameKey: "color.teal" },
  { value: "#06b6d4", nameKey: "color.cyan" },
  { value: "#3b82f6", nameKey: "color.blue" },
  { value: "#8b5cf6", nameKey: "color.violet" },
  { value: "#ec4899", nameKey: "color.pink" },
  { value: "#64748b", nameKey: "color.slate" },
];

/**
 * Hex regex matching the backend `@Pattern` on the request DTO.
 * Accepts both `#3b82f6` and `#3B82F6`.
 */
export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export function isValidPaletteValue(value: string | null | undefined): boolean {
  if (!value) return false;
  return HEX_COLOR_REGEX.test(value);
}
