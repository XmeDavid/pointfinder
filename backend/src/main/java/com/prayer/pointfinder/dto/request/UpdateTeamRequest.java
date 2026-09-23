package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class UpdateTeamRequest {
    @NotBlank
    private String name;

    @Pattern(regexp = "^#[0-9A-Fa-f]{6}$", message = "Color must be a valid hex color (#RRGGBB)")
    private String color;

    /**
     * OW-05: most players this team takes, 1..500. Omit to keep the current
     * limit (older clients send name and color only); use
     * {@code clearMaxPlayers} to remove it.
     */
    @jakarta.validation.constraints.Min(value = 1, message = "A team takes at least 1 player")
    @jakarta.validation.constraints.Max(value = 500, message = "A team takes at most 500 players")
    private Integer maxPlayers;

    /** Removes the limit; wins over {@code maxPlayers}. */
    private Boolean clearMaxPlayers;
}
