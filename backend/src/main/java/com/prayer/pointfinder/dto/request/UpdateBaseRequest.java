package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;
import java.util.UUID;

@Data
public class UpdateBaseRequest {
    @NotBlank
    private String name;

    private String description = "";

    @NotNull
    @DecimalMin(value = "-90.0", message = "Latitude must be between -90 and 90")
    @DecimalMax(value = "90.0", message = "Latitude must be between -90 and 90")
    private Double lat;

    @NotNull
    @DecimalMin(value = "-180.0", message = "Longitude must be between -180 and 180")
    @DecimalMax(value = "180.0", message = "Longitude must be between -180 and 180")
    private Double lng;

    private Boolean nfcLinked;

    private UUID fixedChallengeId;

    private Boolean hidden;

    /**
     * Operator-only game-scoped tag IDs. Each UUID must belong to the same
     * game. Validated in the service layer (400 with code {@code tag.not_in_game}
     * if any ID refers to a tag from a different game). Max 20 tags per base.
     * Null clears all tags (write-through semantics).
     */
    @Size(max = 20, message = "A base can have at most 20 tags")
    private List<UUID> tagIds;

    /** Stage assignment. Null keeps current value; explicit JSON null clears it. */
    private UUID stageId;
}
