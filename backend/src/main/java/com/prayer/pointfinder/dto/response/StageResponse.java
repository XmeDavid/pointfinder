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
        OffsetDateTime updatedAt,
        /** OW-40: the stage's bases are visited in route order. */
        boolean enforceBaseOrder
) {
    public StageResponse(UUID id, UUID gameId, String name, String description, int orderIndex, String transitionType,
            OffsetDateTime scheduledAt, UUID triggerBaseId, boolean isActive, List<UUID> baseIds,
            OffsetDateTime createdAt, OffsetDateTime updatedAt) {
        this(id, gameId, name, description, orderIndex, transitionType, scheduledAt, triggerBaseId, isActive, baseIds, createdAt, updatedAt, false);
    }
}
