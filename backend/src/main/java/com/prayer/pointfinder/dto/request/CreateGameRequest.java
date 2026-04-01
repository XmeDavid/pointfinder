package com.prayer.pointfinder.dto.request;

import com.prayer.pointfinder.util.ValidDateRange;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.Instant;

@Data
@ValidDateRange(startDateField = "startDate", endDateField = "endDate")
public class CreateGameRequest {
    @NotBlank
    @Size(max = 255)
    private String name;

    private String description = "";

    private Instant startDate;

    private Instant endDate;

    private Boolean uniformAssignment = false;

    private String tileSource;

    private String unlockTrigger;
}
