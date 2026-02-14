package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ReviewSubmissionRequest {
    @NotBlank
    private String status; // "approved" or "rejected"

    private String feedback;
}
