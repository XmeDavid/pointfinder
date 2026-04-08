/**
 * Shared FilterBar component used by BasesPage, ChallengesPage, and
 * BasesAndChallengesView.
 *
 * Receives the return value of useTagColorFilter (or a compatible shape)
 * and renders the sticky filter bar.
 *
 * UX notes:
 *   - bg-muted/40 background with SlidersHorizontal icon for discoverability.
 *   - aria-pressed on every chip for a11y.
 *   - Color swatches use ring-2 ring-primary ring-offset-1 for active state
 *     (no layout shift from scale-110).
 *   - role="search" + aria-label on the bar container.
 *   - Visual separator (divider) between tag chips and color swatches.
 *   - Clear button at end of row, labelled "Clear" (concise).
 */

import { SlidersHorizontal, Tag, X } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface FilterBarState {
  allTags: string[];
  allColors: string[];
  tagCounts: Map<string, number>;
  selectedTags: string[];
  selectedColors: string[];
  toggleTag: (tag: string) => void;
  toggleColor: (color: string) => void;
  clearFilters: () => void;
  hasActive: boolean;
  isVisible: boolean;
}

interface FilterBarProps extends FilterBarState {
  /** i18n key prefix used to look up aria labels, e.g. "bases" or "challenges" */
  labelKey?: string;
}

export function FilterBar({
  allTags,
  allColors,
  tagCounts,
  selectedTags,
  selectedColors,
  toggleTag,
  toggleColor,
  clearFilters,
  hasActive,
  isVisible,
}: FilterBarProps) {
  const { t } = useTranslation();

  if (!isVisible) return null;

  return (
    <div
      role="search"
      aria-label={t("filterBar.ariaLabel")}
      className="sticky top-0 z-10 bg-muted/40 border-b border-border py-2 px-0 flex flex-wrap items-center gap-2"
    >
      {/* Discoverability icon + label */}
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        {t("filterBar.label")}
      </span>

      {/* Tag chips */}
      {allTags.map((tag) => {
        const active = selectedTags.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={active}
            onClick={() => toggleTag(tag)}
            className={[
              "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:bg-muted",
            ].join(" ")}
            data-testid={`filter-tag-${tag}`}
          >
            <Tag className="h-3 w-3" aria-hidden="true" />
            {tag}
            {tagCounts.has(tag) && (
              <span className={active ? "opacity-70" : "text-muted-foreground"}>
                ({tagCounts.get(tag)})
              </span>
            )}
          </button>
        );
      })}

      {/* Separator between tags and colors (only when both exist) */}
      {allTags.length > 0 && allColors.length > 0 && (
        <span className="h-4 w-px bg-border shrink-0" aria-hidden="true" />
      )}

      {/* Color swatches */}
      {allColors.map((color) => {
        const active = selectedColors.includes(color);
        return (
          <button
            key={color}
            type="button"
            aria-pressed={active}
            aria-label={`${t("filterBar.filterByColor")}: ${color}`}
            title={color}
            onClick={() => toggleColor(color)}
            className={[
              "h-6 w-6 rounded-full border-2 transition-all",
              active
                ? "border-primary ring-2 ring-primary ring-offset-1"
                : "border-border hover:border-foreground",
            ].join(" ")}
            style={{ backgroundColor: color }}
            data-testid={`filter-color-${color}`}
          />
        );
      })}

      {/* Clear button */}
      {hasActive && (
        <button
          type="button"
          onClick={clearFilters}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          data-testid="filter-clear"
        >
          <X className="h-3 w-3" aria-hidden="true" />
          {t("filterBar.clear")}
        </button>
      )}
    </div>
  );
}
