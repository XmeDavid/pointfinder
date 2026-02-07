package com.dbv.scoutmission.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.time.Instant;

@Data
public class CreateGameRequest {
    @NotBlank
    private String name;

    private String description = "";

    private Instant startDate;

    private Instant endDate;
}
