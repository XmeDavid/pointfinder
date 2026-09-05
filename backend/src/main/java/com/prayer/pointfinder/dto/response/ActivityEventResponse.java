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
    Instant timestamp,
    /**
     * Structured extras. For check-ins: {@code method}, {@code verification},
     * and for claims {@code teammatesInRing} / {@code teammatesTotal}. Null
     * for events that carry nothing beyond the message.
     */
    java.util.Map<String, Object> metadata
) {}
