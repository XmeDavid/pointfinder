package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class ReviewSubmissionRequest {
    @NotNull
    private ReviewStatus status;

    private String feedback;

    @Min(0) @Max(100000)
    private Integer points;
}
