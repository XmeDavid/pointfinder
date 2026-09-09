package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Self-serve checkout is personal only. Clubs are sales-led: an admin creates
 * the org and issues an invoice, so there is no org plan to check out here.
 */
@Data
public class CreateCheckoutRequest {

    /** The only self-serve paid plan: {@code "pro"}. */
    @NotBlank
    private String plan;

    /** {@code "monthly"} or {@code "annual"}. */
    @NotBlank
    private String cycle;
}
