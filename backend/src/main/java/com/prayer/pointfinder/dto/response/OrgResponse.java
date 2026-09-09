package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record OrgResponse(
        UUID id,
        String name,
        String slug,
        UUID createdBy,
        String subscriptionTier,
        String subscriptionStatus,
        Integer memberCount,
        Map<String, Object> quotaOverrides,
        /** End of the paid club term, or null when the org has no term. */
        Instant termEnd,
        Instant createdAt
) {}
