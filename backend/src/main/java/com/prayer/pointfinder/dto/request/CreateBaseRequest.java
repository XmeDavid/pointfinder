package com.prayer.pointfinder.dto.request;

import com.prayer.pointfinder.util.ValidFiniteNumber;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;
import java.util.UUID;

@Data
public class CreateBaseRequest {
    @NotBlank
    @Size(max = 255)
    private String name;

    private String description = "";

    @NotNull
    @ValidFiniteNumber
    @DecimalMin(value = "-90.0", message = "Latitude must be between -90 and 90")
    @DecimalMax(value = "90.0", message = "Latitude must be between -90 and 90")
    private Double lat;

    @NotNull
    @ValidFiniteNumber
    @DecimalMin(value = "-180.0", message = "Longitude must be between -180 and 180")
    @DecimalMax(value = "180.0", message = "Longitude must be between -180 and 180")
    private Double lng;

    private UUID fixedChallengeId;

    private Boolean hidden = false;

    /**
     * Operator-only free-text tags (P1 Phase 4 W3). Never exposed to
     * players (see {@code Base.tags} javadoc). Max 20 entries enforced
     * here; storage is JSON.
     */
    @Size(max = 20, message = "A base can have at most 20 tags")
    private List<@Size(max = 40, message = "Individual tags must be at most 40 characters") String> tags;

    /**
     * Operator-only fixed-palette color (P1 Phase 4 W3). Never exposed
     * to players (see {@code Base.color} javadoc). The client uses a
     * fixed 12-swatch palette; the server accepts any 7-char hex.
     */
    @Pattern(regexp = "^#[0-9a-fA-F]{6}$", message = "Color must be a 7-character hex code like #3b82f6")
    private String color;
}
