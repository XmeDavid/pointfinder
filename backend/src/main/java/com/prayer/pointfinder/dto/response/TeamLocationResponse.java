package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.UUID;

public record TeamLocationResponse(
    UUID teamId,
    UUID playerId,
    String displayName,
    Double lat,
    Double lng,
    Instant updatedAt
) {}
