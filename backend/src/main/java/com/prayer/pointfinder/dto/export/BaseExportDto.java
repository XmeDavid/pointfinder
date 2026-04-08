package com.prayer.pointfinder.dto.export;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BaseExportDto {
    private String tempId;
    private String name;
    private String description;
    private Double lat;
    private Double lng;
    private Boolean hidden;
    private String fixedChallengeTempId;

    /**
     * Operator-only free-text tags (P1 Phase 4 W3). Mirrors
     * {@code CreateBaseRequest.tags} validation: max 20 entries, each
     * bounded at 40 characters. Empty lists and null are both accepted
     * and collapse to {@code null} on import.
     */
    @Size(max = 20, message = "A base can have at most 20 tags")
    private List<@Size(max = 40, message = "Individual tags must be at most 40 characters") String> tags;

    /**
     * Operator-only fixed-palette color (P1 Phase 4 W3). 7-char hex,
     * matching {@code CreateBaseRequest.color}. Null and blank are both
     * accepted and collapse to {@code null} on import.
     */
    @Pattern(regexp = "^#[0-9a-fA-F]{6}$", message = "Color must be a 7-character hex code like #3b82f6")
    private String color;
}
