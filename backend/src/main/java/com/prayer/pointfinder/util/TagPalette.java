package com.prayer.pointfinder.util;

import java.util.Collection;
import java.util.List;

/**
 * Server-side mirror of the frontend {@code colorPalette.ts} swatch list.
 * Used to assign a default color when a tag is created without an explicit color.
 *
 * <p>The list must stay in sync with the frontend palette so the same index
 * produces the same color on both sides. The V41 backfill migration uses a
 * compatible palette for deterministic swatch assignment.
 */
public final class TagPalette {

    private TagPalette() {}

    public static final List<String> SWATCHES = List.of(
        "#3b82f6", // blue-500
        "#ef4444", // red-500
        "#22c55e", // green-500
        "#f59e0b", // amber-500
        "#a855f7", // purple-500
        "#ec4899", // pink-500
        "#14b8a6", // teal-500
        "#f97316", // orange-500
        "#6366f1", // indigo-500
        "#84cc16", // lime-500
        "#06b6d4", // cyan-500
        "#e11d48", // rose-600
        "#8b5cf6", // violet-500
        "#10b981", // emerald-500
        "#f43f5e", // rose-500
        "#0ea5e9"  // sky-500
    );

    /**
     * Returns the next unused swatch color, or a deterministic fallback when
     * all swatches are in use. The fallback wraps by index so it is stable
     * across runs and test seeds.
     *
     * @param usedColors collection of colors already assigned in this game
     * @return a 7-char hex color string
     */
    public static String nextUnused(Collection<String> usedColors) {
        for (String swatch : SWATCHES) {
            if (!usedColors.contains(swatch)) {
                return swatch;
            }
        }
        // All swatches in use — wrap by count so result is deterministic
        return SWATCHES.get(usedColors.size() % SWATCHES.size());
    }
}
