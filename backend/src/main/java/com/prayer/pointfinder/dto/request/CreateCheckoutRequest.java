package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.UUID;

@Data
public class CreateCheckoutRequest {

    @NotBlank
    private String plan; // "pro", "org-base", "org-high"

    @NotBlank
    private String cycle; // "monthly", "annual"

    private UUID orgId; // null for individual, set for org billing
}
