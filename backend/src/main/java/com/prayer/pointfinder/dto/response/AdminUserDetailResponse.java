package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class AdminUserDetailResponse {
    private UUID id;
    private String name;
    private String email;
    private String role;
    private String subscriptionTier;
    private String subscriptionStatus;
    private String billingCycle;
    private Instant currentPeriodEnd;
    private Instant gracePeriodEnd;
    private Map<String, Object> quotaOverrides;
    private String adminNote;
    private int gameCount;
    private int orgCount;
    private long resourceStorageBytes;
    private Instant createdAt;
}
