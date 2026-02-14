package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

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

    /**
     * Optional idempotency key for offline sync.
     * If provided and a submission with this key exists, returns the existing submission.
     */
    private UUID idempotencyKey;
}
