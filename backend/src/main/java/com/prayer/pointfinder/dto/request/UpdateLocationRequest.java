package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.Instant;

@Data
public class UpdateLocationRequest {
    @NotNull
    private Double lat;

    @NotNull
    private Double lng;

    /**
     * Reported horizontal accuracy in metres. Optional so older clients keep
     * working; a non-finite value is discarded rather than rejected, because
     * a bad accuracy reading is not a reason to lose the position itself.
     */
    private Double accuracy;

    /** When the phone captured the fix, as opposed to when we received it. */
    private Instant capturedAt;
}
