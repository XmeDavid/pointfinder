package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.Instant;

@Data
public class CreateGameRequest {
    @NotBlank
    @Size(max = 255)
    private String name;

    private String description = "";

    private Instant startDate;

    private Instant endDate;

    private Boolean uniformAssignment = false;

    private String tileSource;
}
