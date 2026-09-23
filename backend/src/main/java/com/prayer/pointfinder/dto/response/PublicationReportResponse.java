package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.UUID;

/** OW-06: an open report as a platform admin reads it. Never sent to publishers. */
public record PublicationReportResponse(
        UUID id,
        UUID gameId,
        String gameName,
        /** Whether the game is still listed in Explore. */
        boolean listed,
        String reason,
        String details,
        String reporterName,
        Instant createdAt
) {}
