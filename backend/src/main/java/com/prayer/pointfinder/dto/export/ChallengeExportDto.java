package com.prayer.pointfinder.dto.export;

import com.prayer.pointfinder.entity.AnswerType;
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
public class ChallengeExportDto {
    private String tempId;
    private String title;
    private String description;
    private String content;
    private String completionContent;
    private AnswerType answerType;
    private Boolean autoValidate;
    private List<String> correctAnswer;
    private Integer points;
    private Boolean locationBound;
    private Boolean requirePresenceToSubmit;
    private List<String> unlocksBaseTempIds;

    /**
     * Operator-only free-text notes (P1 Phase 4 W2). Mirrors
     * {@code CreateChallengeRequest.operatorNotes} validation: max 5000
     * characters. Null and blank both accepted and collapse to
     * {@code null} on import.
     */
    @Size(max = 5000)
    private String operatorNotes;

    /**
     * Operator-only free-text tags (P1 Phase 4 W3). Mirrors
     * {@code CreateChallengeRequest.tags} validation: max 20 entries,
     * each bounded at 40 characters. Empty lists and null are both
     * accepted and collapse to {@code null} on import.
     */
    @Size(max = 20, message = "A challenge can have at most 20 tags")
    private List<@Size(max = 40, message = "Individual tags must be at most 40 characters") String> tags;

    /**
     * Operator-only fixed-palette color (P1 Phase 4 W3). 7-char hex,
     * matching {@code CreateChallengeRequest.color}. Null and blank are
     * both accepted and collapse to {@code null} on import.
     */
    @Pattern(regexp = "^#[0-9a-fA-F]{6}$", message = "Color must be a 7-character hex code like #3b82f6")
    private String color;
}
