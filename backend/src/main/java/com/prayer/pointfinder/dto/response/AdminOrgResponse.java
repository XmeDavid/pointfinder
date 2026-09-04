package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.UUID;

public record AdminOrgResponse(
    UUID id,
    String name,
    String slug,
    String subscriptionTier,
    String subscriptionStatus,
    int memberCount,
    Instant createdAt
) {}
