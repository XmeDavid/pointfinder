import type { SVGProps } from "react";
import { useTranslation } from "react-i18next";
import { brandMark } from "@/generated/brandMark";
import { cn } from "@/lib/utils/cn";

/**
 * The approved PointFinder mark, drawn from the generated copy of
 * `design-system/brand/pointfinder-mark.svg`. Screens never carry their own
 * path data; the master SVG is the only source and `make design-system-check`
 * catches drift.
 *
 * - `tone="brand"` (default): the semantic brand color for the current theme,
 *   forest green on light canvases and the reversed light mark on dark ones.
 * - `tone="current"`: inherits `currentColor` for one-color and reversed
 *   treatments inside a link, a tile or a photographic band.
 *
 * Accessibility: a standalone mark is an image named “PointFinder”. When the
 * adjacent wordmark or the containing link already names the brand, pass
 * `decorative` so assistive technology hears the name once. No `<title>` or
 * ids are emitted, so repeated inline use never duplicates DOM ids.
 */
export type BrandTone = "brand" | "current";

export interface BrandMarkProps extends Omit<SVGProps<SVGSVGElement>, "children" | "width" | "height"> {
  /** Square rendering size in CSS pixels. */
  size?: number;
  tone?: BrandTone;
  /** Hide from assistive technology because nearby text already names PointFinder. */
  decorative?: boolean;
}

export function BrandMark({ size = 24, tone = "brand", decorative = false, className, ...rest }: BrandMarkProps) {
  const { t } = useTranslation();
  const accessibility = decorative ? { "aria-hidden": true as const } : { role: "img", "aria-label": t("common.appName", "PointFinder") };
  return (
    <svg
      viewBox={brandMark.viewBox}
      width={size}
      height={size}
      fill="currentColor"
      focusable="false"
      data-brand="mark"
      className={cn("shrink-0", tone === "brand" && "text-brand", className)}
      {...accessibility}
      {...rest}
    >
      <path d={brandMark.path} />
    </svg>
  );
}

export interface BrandTileProps {
  /** Tile edge in CSS pixels; the mark frame fills 80% of it, matching the launcher exports. */
  size?: number;
  decorative?: boolean;
  className?: string;
}

/** Reversed treatment: the light mark on the forest-green brand tile, for entry points and compact placements. */
export function BrandTile({ size = 48, decorative = false, className }: BrandTileProps) {
  return (
    <span
      data-brand="tile"
      className={cn("inline-flex shrink-0 items-center justify-center rounded-lg bg-brand-tile text-brand-tile-foreground", className)}
      style={{ width: size, height: size }}
    >
      <BrandMark size={Math.round(size * 0.8)} tone="current" decorative={decorative} />
    </span>
  );
}

export interface BrandLockupProps {
  size?: number;
  tone?: BrandTone;
  className?: string;
  /** Classes for the wordmark text; defaults to a semibold label in the inherited color. */
  textClassName?: string;
}

/** Mark beside the “PointFinder” wordmark for headers, footers and introductions. The text names the brand, so the mark is decorative. */
export function BrandLockup({ size = 24, tone = "brand", className, textClassName }: BrandLockupProps) {
  const { t } = useTranslation();
  return (
    <span data-brand="lockup" className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <BrandMark size={size} tone={tone} decorative />
      <span className={cn("truncate font-semibold tracking-tight", textClassName)}>{t("common.appName", "PointFinder")}</span>
    </span>
  );
}
