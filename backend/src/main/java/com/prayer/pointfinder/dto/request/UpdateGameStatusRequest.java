package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class UpdateGameStatusRequest {
    @NotBlank
    private String status;

    /**
     * When true and transitioning to setup, all progress data
     * (check-ins, submissions, activity events, team locations) is erased.
     */
    private boolean resetProgress;
}
