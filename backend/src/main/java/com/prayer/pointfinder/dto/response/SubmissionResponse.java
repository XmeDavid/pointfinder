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
    String completionContent
) {}
