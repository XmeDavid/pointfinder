package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;
import java.util.UUID;

@Data
public class PlayerSubmissionRequest {
    @NotNull
    private UUID baseId;

    @NotNull
    private UUID challengeId;

    private String answer = "";

    /** URL of uploaded file for photo submissions. */
    private String fileUrl;

    /** URLs of uploaded files for media submissions (multiple files). */
    private List<String> fileUrls;

    /**
     * Optional idempotency key for offline sync.
     * If provided and a submission with this key exists, returns the existing submission.
     */
    private UUID idempotencyKey;
}
