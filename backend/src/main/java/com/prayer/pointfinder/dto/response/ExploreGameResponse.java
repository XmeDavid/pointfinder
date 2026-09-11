package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.UUID;

/**
 * PF-08: what a signed-in account sees in Explore. {@code title} is the game's
 * current name; the rest is the deliberate public summary: no bases,
 * challenges, teams, codes, scores, resources or the game's own description.
 * {@code place} is an area label; coordinates are optional. {@code admission} is {@code open} when a public admission
 * team is designated, else {@code code}; {@code joinable} is whether a new
 * participation can be created from Explore right now (open and live).
 */
public record ExploreGameResponse(
        UUID gameId,
        String title,
        String summary,
        String place,
        Double lat,
        Double lng,
        String category,
        String organizer,
        String gameStatus,
        String admission,
        boolean joinable,
        boolean featured,
        Instant startDate,
        Instant endDate,
        Instant publishedAt,
        Double distanceKm,
        boolean joined,
        UUID playerId
) {}
