/**
 * WCAG 2.1 colour-contrast helpers.
 *
 * Used to ensure readable text on operator-chosen tag colours. This module
 * implements the standard WCAG 2.1 AA contrast ratio formula to guarantee
 * that text is readable over any background colour.
 *
 * The luminance formula follows WCAG 2.x Section 1.4.3 (Contrast Minimum, AA).
 * See https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
 *
 * Usage example (e.g., in a tag chip component):
 * ```
 * const tagBgColor = "#ff6b6b";  // operator-chosen colour
 * const textColor = getReadableTextColor(tagBgColor);  // "#ffffff" or "#000000"
 * ```
 *
 * This ensures WCAG 2.1 AA compliance (≥4.5:1 contrast ratio) for all
 * operator tag palette choices without requiring manual colour coordination.
 */

/**
 * Parse a 3- or 6-character hex colour string into [r, g, b] in the range 0–255.
 * Accepts "#rgb", "#rrggbb" (with or without the leading "#").
 * Returns null for unparseable input so callers can fall back gracefully.
 */
function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.startsWith("#") ? hex.slice(1) : hex;
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return [r, g, b];
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return [r, g, b];
  }
  return null;
}

/**
 * Compute the relative luminance of an sRGB colour as defined by WCAG 2.x.
 * https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
 */
function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Return the WCAG contrast ratio between two hex colours.
 *
 * The contrast ratio is computed per WCAG 2.1 standard: the ratio of the
 * relative luminance of the lighter colour to the darker colour, in the
 * range [1, 21]. A ratio of 1 means no contrast (same colour); 21 is the
 * maximum (black on white or vice versa).
 *
 * @param fgHex - foreground (text) colour in hex format
 * @param bgHex - background colour in hex format
 * @returns contrast ratio in the range [1, 21]
 *
 * @example
 * getContrastRatio("#000000", "#ffffff") // → 21 (maximum contrast)
 * getContrastRatio("#cccccc", "#ffffff") // → 1.1 (very low contrast, fails AA)
 *
 * See https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
 */
export function getContrastRatio(fgHex: string, bgHex: string): number {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);
  if (!fg || !bg) return 1;
  const l1 = relativeLuminance(...fg);
  const l2 = relativeLuminance(...bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Return "#000000" or "#ffffff" — whichever has a higher contrast ratio
 * against `bgHex`. Defaults to "#000000" when the input cannot be parsed.
 *
 * WCAG 2.1 AA requires ≥ 4.5:1 for normal text. This helper always picks
 * the higher-contrast option, guaranteeing compliance on any palette colour.
 *
 * @param bgHex - a hex colour string in "#rgb", "#rrggbb", "rgb", or "rrggbb" format
 * @returns "#ffffff" if white has higher contrast; "#000000" otherwise
 *
 * @example
 * // For a light tag background:
 * getReadableTextColor("#ffeb3b") // → "#000000" (black text)
 *
 * // For a dark tag background:
 * getReadableTextColor("#1a237e") // → "#ffffff" (white text)
 *
 * Typical usage in tag chip components:
 * ```
 * <span style={{ backgroundColor: tagColor, color: getReadableTextColor(tagColor) }}>
 *   {tag.label}
 * </span>
 * ```
 */
export function getReadableTextColor(bgHex: string): "#000000" | "#ffffff" {
  const contrastWhite = getContrastRatio("#ffffff", bgHex);
  const contrastBlack = getContrastRatio("#000000", bgHex);
  return contrastWhite >= contrastBlack ? "#ffffff" : "#000000";
}
