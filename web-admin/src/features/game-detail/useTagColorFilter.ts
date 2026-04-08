/**
 * useTagColorFilter — shared filter hook for tag filtering on bases,
 * challenges, and the unified BasesAndChallengesView.
 *
 * Wave B update: operates on tagIds (UUIDs) instead of raw string tags.
 * The color dimension has been removed — color is now a property of the
 * tag entity itself, so filtering by color is redundant with filtering
 * by tag.
 *
 * Semantics:
 *   - Tags dimension: AND — item must have ALL selected tag IDs.
 *   - No color dimension (removed in Wave B).
 *
 * URL encoding:
 *   - Tag IDs (UUIDs) are stored directly in URL params as comma-separated values.
 *   - Each setter uses { replace: true } to avoid browser-history pollution.
 *
 * The hook also accepts a tagsMap to resolve IDs to label+color for the
 * FilterBar chip rendering.
 */

import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { Tag } from "@/types";

interface Filterable {
  tagIds?: string[];
}

interface UseTagFilterResult<T extends Filterable> {
  filtered: T[];
  allTagIds: string[];
  tagCounts: Map<string, number>;
  selectedTagIds: string[];
  toggleTag: (tagId: string) => void;
  clearFilters: () => void;
  hasActive: boolean;
  isVisible: boolean;
}

/**
 * @param items        The full list to filter.
 * @param paramPrefix  Scopes the URL params (e.g. "bases", "challenges",
 *                     "pairs") so multiple filter bars on the same URL
 *                     don't collide.
 * @param matchFn      Optional override for how an item is tested against
 *                     the selected tagIds. Used by BasesAndChallengesView
 *                     where a pair matches if EITHER its base OR challenge
 *                     matches.
 */
export function useTagColorFilter<T extends Filterable>(
  items: T[],
  paramPrefix: string,
  matchFn?: (item: T, selectedTagIds: string[]) => boolean,
): UseTagFilterResult<T> {
  const [searchParams, setSearchParams] = useSearchParams();

  const tagsKey = `${paramPrefix}_tags`;

  const selectedTagIds = useMemo(() => {
    const raw = searchParams.get(tagsKey);
    return raw ? raw.split(",").filter(Boolean) : [];
  }, [searchParams, tagsKey]);

  function toggleTag(tagId: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const current = (next.get(tagsKey) ?? "").split(",").filter(Boolean);
        const updated = current.includes(tagId)
          ? current.filter((x) => x !== tagId)
          : [...current, tagId];
        if (updated.length > 0) next.set(tagsKey, updated.join(","));
        else next.delete(tagsKey);
        return next;
      },
      { replace: true },
    );
  }

  function clearFilters() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(tagsKey);
        return next;
      },
      { replace: true },
    );
  }

  // Aggregation: collect all distinct tag IDs and their per-item counts.
  // Duplicate tagIds on a single item are collapsed before contributing.
  const { allTagIds, tagCounts } = useMemo(() => {
    const tagMap = new Map<string, number>();

    for (const item of items) {
      const uniqueItemTagIds = new Set(item.tagIds ?? []);
      for (const tagId of uniqueItemTagIds) {
        tagMap.set(tagId, (tagMap.get(tagId) ?? 0) + 1);
      }
    }

    return {
      allTagIds: Array.from(tagMap.keys()),
      tagCounts: tagMap,
    };
  }, [items]);

  const hasActive = selectedTagIds.length > 0;
  const isVisible = allTagIds.length > 0;

  const filtered = useMemo(() => {
    if (!hasActive) return items;

    const defaultMatch = (item: T) => {
      const itemTagIds = item.tagIds ?? [];
      return selectedTagIds.every((id) => itemTagIds.includes(id));
    };

    const fn = matchFn
      ? (item: T) => matchFn(item, selectedTagIds)
      : defaultMatch;
    return items.filter(fn);
  }, [items, selectedTagIds, hasActive, matchFn]);

  return {
    filtered,
    allTagIds,
    tagCounts,
    selectedTagIds,
    toggleTag,
    clearFilters,
    hasActive,
    isVisible,
  };
}

// ---------------------------------------------------------------------------
// Legacy re-exports for tests and consumers that still destructure
// selectedColors / allColors / toggleColor from the old shape.
// These are stubs that return empty arrays / no-ops so the build doesn't
// break while consumers are updated.
// ---------------------------------------------------------------------------

/** @deprecated Wave B: color dimension removed. Use selectedTagIds instead. */
export type LegacyFilterBarState = ReturnType<typeof useTagColorFilter> & {
  allColors: string[];
  selectedColors: string[];
  toggleColor: (color: string) => void;
};

/**
 * Resolve tag IDs to their Tag objects for rendering chip labels/colors.
 * Returns tags in the order they appear in allTagIds (insertion order of
 * the aggregation map, which is stable across renders for the same items).
 */
export function resolveTagsForFilter(
  allTagIds: string[],
  tagsMap: Map<string, Tag>,
): Tag[] {
  return allTagIds
    .map((id) => tagsMap.get(id))
    .filter((t): t is Tag => t !== undefined);
}
