package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.UUID;

public record NotificationResponse(
    UUID id,
    UUID gameId,
    String message,
    UUID targetTeamId,
    Instant sentAt,
    UUID sentBy
) {}
