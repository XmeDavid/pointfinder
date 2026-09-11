package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.UUID;

/** PF-07: the publisher's (and admin's) view of a game's publication. {@code title} always equals {@code gameName}. */
public record GamePublicationResponse(
        UUID gameId,
        String gameName,
        String gameStatus,
        String organizer,
        String title,
        String summary,
        String place,
        Double lat,
        Double lng,
        String category,
        UUID admissionTeamId,
        String admissionTeamName,
        boolean listed,
        Instant publishedAt,
        UUID publishedById,
        String publishedByName,
        boolean featured,
        Instant featuredAt,
        Instant updatedAt
) {}
