package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.UUID;

public record InviteResponse(
    UUID id,
    UUID gameId,
    String gameName,
    String email,
    String status,
    UUID invitedBy,
    String inviterName,
    Instant createdAt
) {}
