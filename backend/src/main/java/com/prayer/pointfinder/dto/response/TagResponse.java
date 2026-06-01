package com.prayer.pointfinder.dto.response;

import lombok.Builder;

import java.time.Instant;
import java.util.UUID;

/**
 * Operator-facing tag DTO. Never exposed to players.
 */
@Builder
public record TagResponse(
        UUID id,
        UUID gameId,
        String label,
        String color,
        Instant createdAt,
        Instant updatedAt
) {}
