package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Body of {@code POST /api/users/me/tutorials/{scenarioId}/practice-game}.
 *
 * <p>{@code name} is the localized game name the client shows. {@code lat} and
 * {@code lng} are where the seeded bases go (the operator's map centre); both
 * or neither. Without them the server places the bases around a fixed spot.
 */
@Data
public class PracticeGameRequest {

    @NotBlank
    @Size(max = 100)
    private String name;

    @DecimalMin(value = "-90.0")
    @DecimalMax(value = "90.0")
    private Double lat;

    @DecimalMin(value = "-180.0")
    @DecimalMax(value = "180.0")
    private Double lng;
}
