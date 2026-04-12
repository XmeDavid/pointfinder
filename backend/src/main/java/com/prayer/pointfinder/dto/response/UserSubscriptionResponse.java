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
public class UserSubscriptionResponse {
    private UUID id;
    private String tier;
    private String status;
    private String billingCycle;
    private Instant currentPeriodEnd;
    private Instant gracePeriodEnd;
    private Map<String, Object> quotaOverrides;
}
