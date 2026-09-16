package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record SubmissionResponse(
    UUID id,
    UUID teamId,
    UUID challengeId,
    UUID baseId,
    String answer,
    String fileUrl,
    List<String> fileUrls,
    String status,
    Instant submittedAt,
    UUID reviewedBy,
    String feedback,
    Integer points,
    String completionContent,
    /** OW-34: the option ids a choice submission selected; null for other answer types. */
    List<String> selectedOptionIds
) {
    public SubmissionResponse(UUID id, UUID teamId, UUID challengeId, UUID baseId, String answer, String fileUrl,
            List<String> fileUrls, String status, Instant submittedAt, UUID reviewedBy, String feedback, Integer points,
            String completionContent) {
        this(id, teamId, challengeId, baseId, answer, fileUrl, fileUrls, status, submittedAt, reviewedBy, feedback, points, completionContent, null);
    }
}
