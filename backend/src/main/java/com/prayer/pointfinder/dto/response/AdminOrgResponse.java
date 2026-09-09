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
    /** End of the paid club term, or null when the org has no term. */
    Instant termEnd,
    Instant createdAt
) {}
