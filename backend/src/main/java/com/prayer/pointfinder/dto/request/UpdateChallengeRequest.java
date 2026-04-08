package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
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
     * Operator-only game-scoped tag IDs. Each UUID must belong to the same
     * game. Validated in the service layer (400 with code {@code tag.not_in_game}
     * if any ID refers to a tag from a different game). Max 20 tags per challenge.
     * Null clears all tags (write-through semantics).
     */
    @Size(max = 20, message = "A challenge can have at most 20 tags")
    private List<UUID> tagIds;
}
