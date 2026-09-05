package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record GameResponse(
        UUID id,
        String name,
        String description,
        Instant startDate,
        Instant endDate,
        String status,
        UUID createdBy,
        List<UUID> operatorIds,
        Boolean uniformAssignment,
        Boolean broadcastEnabled,
        String broadcastCode,
        String tileSource,
        String unlockTrigger,
        UUID orgId,
        String orgName,
        Boolean enforceBaseOrder
) {
    public GameResponse(UUID id, String name, String description, Instant startDate, Instant endDate, String status, UUID createdBy, List<UUID> operatorIds, Boolean uniformAssignment, Boolean broadcastEnabled, String broadcastCode, String tileSource, String unlockTrigger, UUID orgId, String orgName) {
        this(id, name, description, startDate, endDate, status, createdBy, operatorIds, uniformAssignment, broadcastEnabled, broadcastCode, tileSource, unlockTrigger, orgId, orgName, false);
    }
}
