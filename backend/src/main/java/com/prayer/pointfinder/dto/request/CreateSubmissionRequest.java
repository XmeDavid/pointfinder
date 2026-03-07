package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;
import java.util.UUID;

@Data
public class CreateSubmissionRequest {
    @NotNull
    private UUID teamId;

    @NotNull
    private UUID challengeId;

    @NotNull
    private UUID baseId;

    private String answer = "";

    /** URL of uploaded file for photo submissions. */
    private String fileUrl;

    /** URLs of uploaded files for media submissions (multiple files). */
    private List<String> fileUrls;

    /**
     * Optional idempotency key for offline sync deduplication.
     */
    private UUID idempotencyKey;
}
