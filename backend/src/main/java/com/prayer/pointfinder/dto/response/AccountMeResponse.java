package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** The signed-in account as the player app sees it. Never carries scores. */
public record AccountMeResponse(
        UUID id,
        String email,
        String name,
        String role,
        boolean emailVerified,
        List<Participation> participations
) {
    public record Participation(
            UUID playerId,
            UUID gameId,
            String gameName,
            String gameStatus,
            UUID teamId,
            String teamName,
            String teamColor,
            Instant joinedAt
    ) {}
}
