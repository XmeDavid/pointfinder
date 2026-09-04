package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.UUID;

/**
 * Operator-facing tag DTO. Never exposed to players.
 */
public record TagResponse(
        UUID id,
        UUID gameId,
        String label,
        String color,
        Instant createdAt,
        Instant updatedAt
) {}
