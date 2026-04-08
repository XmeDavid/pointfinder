package com.prayer.pointfinder.dto.export;

import com.prayer.pointfinder.entity.AnswerType;
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
     * Operator-only tag labels (not IDs — IDs do not survive export/import).
     * On import, tags are upserted by label into the new game's vocabulary.
     * Max 20 entries.
     */
    private List<String> tagLabels;
}
