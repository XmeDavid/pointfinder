package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.Instant;
import java.util.Map;

/**
 * What an admin fills in to stand a club up after a deal is signed. The org is
 * created at tier {@code club}; {@code quotaOverrides} carries whatever the
 * deal agreed that differs from the club defaults.
 */
@Data
public class CreateAdminOrgRequest {

    @NotBlank
    @Size(min = 2, max = 100)
    private String name;

    /**
     * The person who runs the club. If they already have an account they get a
     * membership with every permission; otherwise they get an invite that also
     * makes them the org's owner once they register.
     */
    @NotBlank
    @Email
    private String adminEmail;

    /** Per-deal limits, replacing the club defaults key by key. */
    private Map<String, Object> quotaOverrides;

    /** End of the paid term. Null leaves the club without one until an invoice is paid. */
    private Instant termEnd;

    private String adminNote;
}
