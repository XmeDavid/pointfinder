import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import { COLOR_PALETTE } from "@/lib/colorPalette";
import { cn } from "@/lib/utils";

interface ColorPickerProps {
  /** Currently-selected hex color (e.g. `#3b82f6`), or null/undefined for "no color". */
  value: string | null | undefined;
  /** Fires with a palette hex value or `null` when the operator clears the color. */
  onChange: (value: string | null) => void;
  /** Optional test id passed to the root element for vitest queries. */
  "data-testid"?: string;
  /** Optional className merged with the root. */
  className?: string;
}

/**
 * Fixed-palette color picker used by the operator workflow
 * (P1 Phase 4 W3 — tags and colors on bases and challenges).
 *
 * Renders the 12-swatch palette from `colorPalette.ts` as clickable
 * round chips plus an explicit "no color" option that sets the value
 * to `null`. Value is stored as a 7-char hex string on the backend,
 * matching the existing `Team.color` convention.
 *
 * Privacy: the selected color is operator-only metadata and is never
 * exposed to players. See `docs/business-logic.md` § "Tags and Colors
 * on Bases and Challenges".
 */
export function ColorPicker({
  value,
  onChange,
  "data-testid": testId,
  className,
}: ColorPickerProps) {
  const { t } = useTranslation();
  const normalized = value ? value.toLowerCase() : null;

  // Compute a human-readable label for the current selection so the live
  // region can announce it to screen readers when the value changes.
  const selectedLabel = normalized === null
    ? t("color.none")
    : (COLOR_PALETTE.find((s) => s.value.toLowerCase() === normalized)
        ? t(COLOR_PALETTE.find((s) => s.value.toLowerCase() === normalized)!.nameKey)
        : normalized);

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      data-testid={testId}
      role="radiogroup"
      aria-label={t("color.pickerLabel")}
    >
      {/* Live region: announces selection changes to screen readers */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {t("color.selected", { color: selectedLabel })}
      </span>
      <button
        type="button"
        role="radio"
        aria-checked={normalized === null}
        aria-label={t("color.none")}
        title={t("color.none")}
        onClick={() => onChange(null)}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full border text-muted-foreground transition",
          normalized === null
            ? "border-foreground bg-muted"
            : "border-dashed border-input hover:border-foreground",
        )}
        data-testid={testId ? `${testId}-none` : undefined}
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {COLOR_PALETTE.map((swatch) => {
        const isSelected = normalized === swatch.value.toLowerCase();
        const label = t(swatch.nameKey);
        return (
          <button
            key={swatch.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={label}
            title={label}
            onClick={() => onChange(swatch.value)}
            style={{ backgroundColor: swatch.value }}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full border-2 transition",
              isSelected
                ? "border-foreground ring-2 ring-foreground ring-offset-2 ring-offset-background"
                : "border-foreground/60 hover:border-foreground",
            )}
            data-testid={testId ? `${testId}-${swatch.value.slice(1)}` : undefined}
          >
            {isSelected && <Check className="h-3.5 w-3.5 text-white drop-shadow" />}
          </button>
        );
      })}
    </div>
  );
}
