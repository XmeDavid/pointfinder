package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.List;

/** Earned XP in the latest cycle; placement is available only after the game ends. */
public record XpRewardResponse(
        /** `pending` includes earned action XP; ending finalizes placement and the remaining awards. */
        String state,
        Instant finalizedAt,
        long xp,
        List<Award> awards,
        Placement placement,
        Level level
) {
    public record Award(String kind, int amount, int count) {}
    public record Placement(Integer placement, boolean tied, int teams, boolean completed, boolean eligible, String ineligibleReason) {}
    /** Only for a linked participation: the account's current level, including live action XP. */
    public record Level(int level, long xp, long xpForCurrentLevel, long xpForNextLevel) {}
}
