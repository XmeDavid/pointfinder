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
  { value: dataColors.red, nameKey: "color.red" },
  { value: dataColors.orange, nameKey: "color.orange" },
  { value: dataColors.amber, nameKey: "color.amber" },
  { value: dataColors.yellow, nameKey: "color.yellow" },
  { value: dataColors.lime, nameKey: "color.lime" },
  { value: dataColors.green, nameKey: "color.green" },
  { value: dataColors.emerald, nameKey: "color.emerald" },
  { value: dataColors.teal, nameKey: "color.teal" },
  { value: dataColors.cyan, nameKey: "color.cyan" },
  { value: dataColors.blue, nameKey: "color.blue" },
  { value: dataColors.indigo, nameKey: "color.indigo" },
  { value: dataColors.violet, nameKey: "color.violet" },
  { value: dataColors.purple, nameKey: "color.purple" },
  { value: dataColors.pink, nameKey: "color.pink" },
  { value: dataColors.rose, nameKey: "color.rose" },
  { value: dataColors.statusNotVisited, nameKey: "color.slate" },
];

/**
 * Hex regex matching the backend `@Pattern` on the request DTO.
 * Accepts both lower- and upper-case six-digit hex values.
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
import { dataColors } from "@/generated/colorValues";
