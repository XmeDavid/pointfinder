package com.prayer.pointfinder.xp;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Formula version 1. A brand-new account is level 0. Reaching level n needs
 * 200 × n^1.35 total XP. The game factor is 0.2 + 1.8 × ln(1 + L) / ln(500),
 * capped at 2.0: 0.2 at level 0, about 1.1 at level 21, 2.0 at level 500.
 */
public final class XpLevels {
    public static final int FORMULA_VERSION = 1;
    public static final int CHECK_IN_XP = 1;
    public static final int BASE_COMPLETED_XP = 5;
    public static final int GAME_COMPLETED_XP = 50;
    public static final int PLACEMENT_RANK_XP = 100;
    public static final int PLACEMENT_SIZE_XP = 50;
    public static final double PLACEMENT_SIZE_CAP = 10.0;
    private static final double LEVEL_EXPONENT = 1.35;
    private static final double LEVEL_SCALE = 200.0;
    private static final double FACTOR_FLOOR = 0.2;
    private static final double FACTOR_RANGE = 1.8;
    private static final double FACTOR_CAP = 2.0;
    private static final double LN_500 = Math.log(500);

    private XpLevels() {}

    /** Total XP needed to reach {@code level}; 0 for level 0. */
    public static long xpForLevel(int level) {
        if (level <= 0) return 0;
        return Math.round(LEVEL_SCALE * Math.pow(level, LEVEL_EXPONENT));
    }

    /** The highest level whose threshold {@code totalXp} meets. */
    public static int levelFor(long totalXp) {
        if (totalXp < xpForLevel(1)) return 0;
        int level = (int) Math.floor(Math.pow(totalXp / LEVEL_SCALE, 1.0 / LEVEL_EXPONENT));
        while (xpForLevel(level + 1) <= totalXp) level++;
        while (level > 0 && xpForLevel(level) > totalXp) level--;
        return level;
    }

    public static BigDecimal factorForLevel(int level) {
        double f = FACTOR_FLOOR + FACTOR_RANGE * Math.log1p(Math.max(0, level)) / LN_500;
        return BigDecimal.valueOf(Math.min(FACTOR_CAP, f)).setScale(4, RoundingMode.HALF_UP);
    }

    /** Applies the factor: rounded to the nearest integer, at least 1 for a non-zero base amount. */
    public static int apply(int baseAmount, BigDecimal factor) {
        if (baseAmount == 0) return 0;
        int scaled = factor.multiply(BigDecimal.valueOf(baseAmount)).setScale(0, RoundingMode.HALF_UP).intValue();
        return Math.max(1, scaled);
    }

    /**
     * Placement base amount for a team: s × ((T / p) × 100 + min(P / m, 10) × 50), where
     * s is the share of people in other teams that finished below this team.
     */
    public static int placementBase(int teams, int placement, int players, int members, int beaten) {
        if (teams < 2 || placement < 1 || members < 1) return 0;
        int others = players - members;
        if (others <= 0 || beaten <= 0) return 0;
        double share = Math.min(1.0, (double) beaten / others);
        double rank = ((double) teams / placement) * PLACEMENT_RANK_XP;
        double size = Math.min(PLACEMENT_SIZE_CAP, (double) players / members) * PLACEMENT_SIZE_XP;
        return (int) Math.round(share * (rank + size));
    }
}
