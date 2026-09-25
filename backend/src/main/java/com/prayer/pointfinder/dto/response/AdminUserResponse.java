package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.UUID;

public record AdminUserResponse(
    UUID id,
    String name,
    String email,
    String role,
    String subscriptionTier,
    String subscriptionStatus,
    Instant createdAt,
    /** When a platform admin blocked the account, or null. */
    Instant blockedAt
) {}
