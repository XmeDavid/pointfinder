package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record AdminOrgDetailResponse(
    UUID id, String name, String slug, UUID createdBy, String createdByName,
    String subscriptionTier, String subscriptionStatus, String stripeCustomerId,
    Instant gracePeriodEnd, Map<String, Object> quotaOverrides, String adminNote,
    int memberCount, int gameCount, long resourceStorageBytes,
    List<OrgMemberResponse> members, Instant createdAt
) {}
