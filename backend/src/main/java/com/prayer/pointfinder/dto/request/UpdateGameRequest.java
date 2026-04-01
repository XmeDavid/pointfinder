package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.Instant;

@Data
public class UpdateGameRequest {
    @NotBlank
    @Size(max = 255)
    private String name;

    private String description = "";

    private Instant startDate;

    private Instant endDate;

    private Boolean uniformAssignment;

    private Boolean broadcastEnabled;

    private String tileSource;

    private String unlockTrigger;
}
