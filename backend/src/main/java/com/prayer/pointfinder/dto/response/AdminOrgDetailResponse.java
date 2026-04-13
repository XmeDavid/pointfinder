package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class AdminOrgDetailResponse {
    private UUID id;
    private String name;
    private String slug;
    private UUID createdBy;
    private String createdByName;
    private String subscriptionTier;
    private String subscriptionStatus;
    private String stripeCustomerId;
    private Instant gracePeriodEnd;
    private Map<String, Object> quotaOverrides;
    private String adminNote;
    private int memberCount;
    private int gameCount;
    private long resourceStorageBytes;
    private List<OrgMemberResponse> members;
    private Instant createdAt;
}
