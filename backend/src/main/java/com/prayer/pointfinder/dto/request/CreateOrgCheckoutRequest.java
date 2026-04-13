package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CreateOrgCheckoutRequest {
    @NotBlank
    private String orgName;

    @NotBlank
    private String plan; // "org-base" or "org-high"

    @NotBlank
    private String cycle; // "monthly" or "annual"
}
