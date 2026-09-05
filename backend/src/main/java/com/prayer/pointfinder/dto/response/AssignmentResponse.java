package com.prayer.pointfinder.dto.response;

import java.util.UUID;

@lombok.Builder
public record AssignmentResponse(
        UUID id,
        UUID gameId,
        UUID baseId,
        UUID challengeId,
        UUID teamId
) {}
