package com.prayer.pointfinder.dto.response;

import lombok.Builder;

import java.util.UUID;

@Builder
public record AssignmentResponse(
        UUID id,
        UUID gameId,
        UUID baseId,
        UUID challengeId,
        UUID teamId
) {}
