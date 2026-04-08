/**
 * 16-swatch WCAG-safe color palette for game tags.
 *
 * Extended from the original 12-swatch palette to give operators more
 * distinct visual vocabulary. Colors are a curated subset of Tailwind
 * `*-500` hues plus a neutral slate. Each swatch meets WCAG AA contrast
 * against both white and dark backgrounds when used as a chip background
 * (text is rendered in white or dark depending on luminance at runtime).
 *
 * The backend accepts any valid 7-char hex — the palette is enforced
 * client-side only for visual consistency.
 *
 * Privacy: tag colors are operator-only and are never exposed to players.
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
  { value: "#10b981", nameKey: "color.emerald" },
  { value: "#14b8a6", nameKey: "color.teal" },
  { value: "#06b6d4", nameKey: "color.cyan" },
  { value: "#3b82f6", nameKey: "color.blue" },
  { value: "#6366f1", nameKey: "color.indigo" },
  { value: "#8b5cf6", nameKey: "color.violet" },
  { value: "#a855f7", nameKey: "color.purple" },
  { value: "#ec4899", nameKey: "color.pink" },
  { value: "#f43f5e", nameKey: "color.rose" },
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

/**
 * Pick the next default color for a new tag.
 *
 * Cycles through COLOR_PALETTE in order and returns the first swatch whose
 * value is not already in `existingTagColors`. If all swatches are used,
 * returns a random swatch value (palette wraps rather than blocking creation).
 */
export function pickNextDefaultColor(existingTagColors: string[]): string {
  const usedSet = new Set(existingTagColors.map((c) => c.toLowerCase()));
  const unused = COLOR_PALETTE.find((s) => !usedSet.has(s.value.toLowerCase()));
  if (unused) return unused.value;
  // All used — pick random
  return COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)].value;
}
