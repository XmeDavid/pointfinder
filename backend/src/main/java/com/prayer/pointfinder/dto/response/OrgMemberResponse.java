package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.UUID;

public record OrgMemberResponse(
    UUID id,
    UUID userId,
    String name,
    String email,
    Integer permissions,
    Instant joinedAt
) {}
