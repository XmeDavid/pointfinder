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
}
