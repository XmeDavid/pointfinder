package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record UserSubscriptionResponse(
        UUID id,
        String tier,
        String status,
        String billingCycle,
        Instant currentPeriodEnd,
        Instant gracePeriodEnd,
        Map<String, Object> quotaOverrides
) {}
