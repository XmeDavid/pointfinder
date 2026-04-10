package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class StageResponse {
    private UUID id;
    private UUID gameId;
    private String name;
    private String description;
    private int orderIndex;
    private String transitionType;
    private OffsetDateTime scheduledAt;
    private UUID triggerBaseId;
    private boolean isActive;
    private List<UUID> baseIds;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
}
