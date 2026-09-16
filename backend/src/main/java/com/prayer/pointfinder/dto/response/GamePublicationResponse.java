package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.UUID;

/** PF-07: the publisher's (and admin's) view of a game's publication. {@code title} always equals {@code gameName}. */
public record GamePublicationResponse(
        UUID gameId,
        String gameName,
        String gameStatus,
        String organizer,
        /** ISO 639-1 code of the game's content language, or null when the organizer did not say. */
        String contentLanguage,
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
