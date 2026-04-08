/**
 * useTagColorFilter — shared filter hook for tag/color filtering on bases,
 * challenges, and the unified BasesAndChallengesView.
 *
 * Semantics (per code-review fix):
 *   - Tags dimension: AND — item must have ALL selected tags.
 *     Convention: tags are trimmed on aggregation; comparison is case-sensitive.
 *   - Colors dimension: OR — item's color must match ANY selected color
 *     (an item has only one color, so OR is the only sensible behavior).
 *   - Across dimensions: AND — item must pass both predicates.
 *
 * URL encoding:
 *   - Tag values are URL-encoded with encodeURIComponent on write and
 *     decodeURIComponent on read to handle special characters.
 *   - Each setter uses { replace: true } to avoid browser-history pollution.
 *
 * Colors are sorted alphabetically by hex string for stable rendering order.
 */

import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

interface Filterable {
  tags?: string[];
  color?: string;
}

interface UseTagColorFilterResult<T extends Filterable> {
  filtered: T[];
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

/**
 * @param items   The full list to filter.
 * @param paramPrefix   Scopes the URL params (e.g. "bases", "challenges",
 *                      "pairs") so multiple filter bars on the same URL don't
 *                      collide.
 * @param matchFn   Optional override for how an item is tested against the
 *                  selected tags/colors. Defaults to AND-tags + OR-colors.
 *                  Used by BasesAndChallengesView where a pair matches if
 *                  EITHER its base OR its challenge matches.
 */
export function useTagColorFilter<T extends Filterable>(
  items: T[],
  paramPrefix: string,
  matchFn?: (item: T, selectedTags: string[], selectedColors: string[]) => boolean,
): UseTagColorFilterResult<T> {
  const [searchParams, setSearchParams] = useSearchParams();

  const tagsKey = `${paramPrefix}_tags`;
  const colorsKey = `${paramPrefix}_colors`;

  const selectedTags = useMemo(() => {
    const raw = searchParams.get(tagsKey);
    return raw
      ? raw
          .split(",")
          .filter(Boolean)
          .map((v) => decodeURIComponent(v))
      : [];
  }, [searchParams, tagsKey]);

  const selectedColors = useMemo(() => {
    const raw = searchParams.get(colorsKey);
    return raw
      ? raw
          .split(",")
          .filter(Boolean)
          .map((v) => decodeURIComponent(v))
      : [];
  }, [searchParams, colorsKey]);

  function toggleTag(tag: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const current = (next.get(tagsKey) ?? "")
          .split(",")
          .filter(Boolean)
          .map((v) => decodeURIComponent(v));
        const updated = current.includes(tag)
          ? current.filter((x) => x !== tag)
          : [...current, tag];
        if (updated.length > 0)
          next.set(tagsKey, updated.map(encodeURIComponent).join(","));
        else next.delete(tagsKey);
        return next;
      },
      { replace: true },
    );
  }

  function toggleColor(color: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const current = (next.get(colorsKey) ?? "")
          .split(",")
          .filter(Boolean)
          .map((v) => decodeURIComponent(v));
        const updated = current.includes(color)
          ? current.filter((x) => x !== color)
          : [...current, color];
        if (updated.length > 0)
          next.set(colorsKey, updated.map(encodeURIComponent).join(","));
        else next.delete(colorsKey);
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
        next.delete(colorsKey);
        return next;
      },
      { replace: true },
    );
  }

  // Aggregation: collect all distinct tags (trimmed, deduped) and colors.
  // Duplicate tags on a single item are collapsed (Set per item) before
  // contributing to the global counts — so ["morning","morning"] counts
  // as 1 for that item.
  // Case-sensitive comparison is the chosen convention (see comment in
  // filter-tags-colors.test.ts for rationale).
  const { allTags, allColors, tagCounts } = useMemo(() => {
    const tagMap = new Map<string, number>();
    const colorSet = new Set<string>();

    for (const item of items) {
      // Dedupe per-item tags before counting
      const uniqueItemTags = new Set(
        (item.tags ?? []).map((t) => t.trim()).filter(Boolean),
      );
      for (const tag of uniqueItemTags) {
        tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
      }
      if (item.color) {
        colorSet.add(item.color);
      }
    }

    return {
      allTags: Array.from(tagMap.keys()).sort(),
      // Colors sorted alphabetically by hex for stable render order
      allColors: Array.from(colorSet).sort(),
      tagCounts: tagMap,
    };
  }, [items]);

  const hasActive = selectedTags.length > 0 || selectedColors.length > 0;
  const isVisible = allTags.length > 0 || allColors.length > 0;

  const filtered = useMemo(() => {
    if (!hasActive) return items;

    const defaultMatch = (item: T) => {
      // Tags: AND — item must have ALL selected tags (after trimming)
      const itemTags = (item.tags ?? []).map((t) => t.trim());
      const tagPass =
        selectedTags.length === 0 ||
        selectedTags.every((st) => itemTags.includes(st));

      // Colors: OR — item's color must match ANY selected color
      const colorPass =
        selectedColors.length === 0 ||
        (item.color !== undefined && selectedColors.includes(item.color));

      // Cross-dimension: AND
      return tagPass && colorPass;
    };

    const fn = matchFn ?? defaultMatch;
    return items.filter((item) => fn(item, selectedTags, selectedColors));
  }, [items, selectedTags, selectedColors, hasActive, matchFn]);

  return {
    filtered,
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
  };
}
