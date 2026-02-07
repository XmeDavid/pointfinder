package com.dbv.scoutmission.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.Instant;

@Data
public class UpdateGameRequest {
    @NotBlank
    private String name;

    private String description = "";

    @NotNull
    private Instant startDate;

    @NotNull
    private Instant endDate;
}
