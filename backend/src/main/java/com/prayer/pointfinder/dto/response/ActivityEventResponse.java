package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.UUID;

public record ActivityEventResponse(
    UUID id,
    UUID gameId,
    String type,
    UUID teamId,
    UUID baseId,
    UUID challengeId,
    String message,
    Instant timestamp
) {}
