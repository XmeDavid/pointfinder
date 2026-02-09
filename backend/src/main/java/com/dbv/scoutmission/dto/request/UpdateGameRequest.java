package com.dbv.scoutmission.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.time.Instant;

@Data
public class UpdateGameRequest {
    @NotBlank
    private String name;

    private String description = "";

    private Instant startDate;

    private Instant endDate;

    private Boolean uniformAssignment;
}
