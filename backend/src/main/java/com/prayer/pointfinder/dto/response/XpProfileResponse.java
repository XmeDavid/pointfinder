package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** The signed-in account's XP profile. Private to the account in this slice; never game points. */
public record XpProfileResponse(
        int level,
        long xp,
        long xpForCurrentLevel,
        long xpForNextLevel,
        int gamesPlayed,
        int gamesCompleted,
        int basesCompleted,
        List<Placement> placements
) {
    public record Placement(
            UUID gameId,
            String gameName,
            Instant endedAt,
            String teamName,
            Integer placement,
            boolean tied,
            int teams,
            boolean completed,
            boolean eligible,
            String ineligibleReason,
            long xp
    ) {}
}
