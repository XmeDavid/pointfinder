package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;
import java.util.UUID;

@Data
public class UpdateChallengeRequest {
    @NotBlank
    private String title;

    private String description = "";

    private String content = "";

    private String completionContent = "";

    @NotBlank
    private String answerType;

    private Boolean autoValidate = false;

    private List<String> correctAnswer;

    @NotNull @Min(0) @Max(100000)
    private Integer points;

    private Boolean locationBound = false;

    private Boolean requirePresenceToSubmit = false;

    private UUID fixedBaseId;

    private List<UUID> unlocksBaseIds;

    /**
     * Operator-only free-text notes. Never exposed to players (see
     * {@code Challenge.operatorNotes} javadoc). Length is capped at 5000
     * characters to prevent arbitrarily large payloads; the underlying
     * column is an unbounded TEXT so the limit can be raised without a
     * schema migration.
     */
    @Size(max = 5000)
    private String operatorNotes;

    /**
     * Operator-only free-text tags (P1 Phase 4 W3). Never exposed to
     * players (see {@code Challenge.tags} javadoc). Max 20 entries
     * enforced here; storage is JSON.
     */
    @Size(max = 20, message = "A challenge can have at most 20 tags")
    private List<@Size(max = 40, message = "Individual tags must be at most 40 characters") String> tags;

    /**
     * Operator-only fixed-palette color (P1 Phase 4 W3). Never exposed
     * to players (see {@code Challenge.color} javadoc).
     */
    @Pattern(regexp = "^#[0-9a-fA-F]{6}$", message = "Color must be a 7-character hex code like #3b82f6")
    private String color;
}
