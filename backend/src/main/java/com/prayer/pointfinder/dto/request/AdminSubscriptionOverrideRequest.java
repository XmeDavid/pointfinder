package com.prayer.pointfinder.dto.request;

import lombok.Data;

import java.time.Instant;
import java.util.Map;

@Data
public class AdminSubscriptionOverrideRequest {
    private String tier;
    private String status;
    private String billingCycle;
    private Instant gracePeriodEnd;
    private Map<String, Object> quotaOverrides;
    private String adminNote;
}
