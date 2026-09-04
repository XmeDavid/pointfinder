package com.prayer.pointfinder.dto.response;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record StageResponse(
        UUID id,
        UUID gameId,
        String name,
        String description,
        int orderIndex,
        String transitionType,
        OffsetDateTime scheduledAt,
        UUID triggerBaseId,
        boolean isActive,
        List<UUID> baseIds,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {}
