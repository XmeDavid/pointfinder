package com.prayer.pointfinder.dto.response;

import java.util.UUID;

public record AssignmentResponse(
        UUID id,
        UUID gameId,
        UUID baseId,
        UUID challengeId,
        UUID teamId
) {}
