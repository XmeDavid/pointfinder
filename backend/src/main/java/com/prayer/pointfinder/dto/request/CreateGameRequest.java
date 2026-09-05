package com.prayer.pointfinder.dto.request;

import com.prayer.pointfinder.util.ValidDateRange;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
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

    private Boolean enforceBaseOrder;

    /** {@code NFC}, {@code QR}, or {@code LOCATION}, case-insensitive. */
    private String defaultCheckInMethod;

    /** Default location radius in metres; clamped to 5..200 on write. */
    @Min(value = 5, message = "Check-in radius must be at least 5 m")
    @Max(value = 200, message = "Check-in radius must be at most 200 m")
    private Integer defaultCheckInRadiusM;
}
