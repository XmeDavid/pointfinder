package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.Instant;
import java.util.Map;

/**
 * A partial update to a club. Every field is optional; only the ones present
 * are applied. {@code tier} and {@code status} are validated against the Java
 * enums so a typo answers 400, not 500.
 */
@Data
public class UpdateAdminOrgRequest {

    @Size(min = 2, max = 100)
    private String name;

    /** {@code free} or {@code club}. */
    private String tier;

    /** {@code active}, {@code past_due}, {@code grace_period}, {@code frozen}, {@code cancelled}. */
    private String status;

    private Map<String, Object> quotaOverrides;

    private Instant termEnd;

    private Instant gracePeriodEnd;

    private String adminNote;
}
