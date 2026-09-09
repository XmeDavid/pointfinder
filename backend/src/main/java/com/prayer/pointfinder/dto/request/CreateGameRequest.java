package com.prayer.pointfinder.dto.request;

import com.prayer.pointfinder.util.ValidDateRange;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.Data;

import java.time.Instant;
import java.util.UUID;

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

    /**
     * Set to {@code first-game} by the create dialog while that tutorial is
     * running. Honoured only while the caller's {@code first-game} progress row
     * is {@code in_progress}; otherwise a normal game is created.
     */
    @jakarta.validation.constraints.Size(max = 64)
    private String tutorialScenario;

    /**
     * Creates the game inside this organization instead of the caller's
     * personal workspace. The caller must be a member with
     * {@code CREATE_GAMES}. Ignored while {@code tutorialScenario} is set:
     * practice games are always personal.
     */
    private UUID orgId;
}
