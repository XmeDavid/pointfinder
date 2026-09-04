package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record AdminUserDetailResponse(
    UUID id, String name, String email, String role,
    String subscriptionTier, String subscriptionStatus, String billingCycle,
    Instant currentPeriodEnd, Instant gracePeriodEnd,
    Map<String, Object> quotaOverrides, String adminNote,
    int gameCount, int orgCount, long resourceStorageBytes, Instant createdAt
) {}
