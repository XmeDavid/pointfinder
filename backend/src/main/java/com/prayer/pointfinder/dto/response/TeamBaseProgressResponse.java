package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.UUID;

public record TeamBaseProgressResponse(
    UUID baseId,
    UUID teamId,
    String status,
    Instant checkedInAt,
    UUID challengeId,
    String submissionStatus
) {}
