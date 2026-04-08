/**
 * Shared FilterBar component used by BasesPage, ChallengesPage, and
 * BasesAndChallengesView.
 *
 * Wave B update: filter chips now show tag label + tag color (background).
 * The color swatch dimension has been removed — color is a property of the
 * tag entity, so filtering by color is redundant with filtering by tag.
 *
 * Receives the return value of useTagColorFilter plus a resolvedTags array
 * (Tag objects corresponding to allTagIds) for chip rendering.
 *
 * UX notes:
 *   - bg-muted/40 background with SlidersHorizontal icon for discoverability.
 *   - aria-pressed on every chip for a11y.
 *   - Active chips use the tag's own color as background (with readable text).
 *   - role="search" + aria-label on the bar container.
 */

import { useMemo } from "react";
import { SlidersHorizontal, Tag, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Tag as TagType } from "@/types";
import { getReadableTextColor } from "@/lib/colorContrast";

export interface FilterBarState {
  allTagIds: string[];
  tagCounts: Map<string, number>;
  selectedTagIds: string[];
  toggleTag: (tagId: string) => void;
  clearFilters: () => void;
  hasActive: boolean;
  isVisible: boolean;
  /** Resolved Tag objects for allTagIds — used for chip label + color. */
  resolvedTags: TagType[];
}

interface FilterBarProps extends FilterBarState {
  /** i18n key prefix used to look up aria labels, e.g. "bases" or "challenges" */
  labelKey?: string;
}

export function FilterBar({
  allTagIds,
  tagCounts,
  selectedTagIds,
  toggleTag,
  clearFilters,
  hasActive,
  isVisible,
  resolvedTags,
}: FilterBarProps) {
  const { t } = useTranslation();

  // O(1) tag lookup — avoids O(N²) find() per chip when resolvedTags is large.
  const resolvedTagsMap = useMemo(
    () => new Map(resolvedTags.map((tag) => [tag.id, tag])),
    [resolvedTags],
  );

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

      {/* Tag chips — label from resolved Tag, background from tag color when active */}
      {allTagIds.map((tagId) => {
        const resolved = resolvedTagsMap.get(tagId);
        const label = resolved?.label ?? tagId;
        const tagColor = resolved?.color;
        const active = selectedTagIds.includes(tagId);
        const activeTextColor = active && tagColor ? getReadableTextColor(tagColor) : undefined;

        return (
          <button
            key={tagId}
            type="button"
            aria-pressed={active}
            onClick={() => toggleTag(tagId)}
            className={[
              "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "border-transparent"
                : "bg-background text-foreground border-border hover:bg-muted",
            ].join(" ")}
            style={
              active && tagColor
                ? { backgroundColor: tagColor, borderColor: tagColor, color: activeTextColor }
                : undefined
            }
            data-testid={`filter-tag-${tagId}`}
          >
            {tagColor && !active && (
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: tagColor }}
                aria-hidden="true"
              />
            )}
            <Tag className="h-3 w-3" aria-hidden="true" />
            {label}
            {tagCounts.has(tagId) && (
              <span className={active ? "opacity-70" : "text-muted-foreground"}>
                ({tagCounts.get(tagId)})
              </span>
            )}
          </button>
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
