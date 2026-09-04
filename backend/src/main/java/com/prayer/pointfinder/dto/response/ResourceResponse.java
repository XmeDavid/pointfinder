package com.prayer.pointfinder.dto.response;

import com.prayer.pointfinder.entity.ResourceType;

import java.time.Instant;
import java.util.UUID;

public record ResourceResponse(
        UUID id,
        UUID orgId,
        UUID gameId,
        UUID folderId,
        ResourceType type,
        String name,
        String contentType,
        String content,
        Long sizeBytes,
        Boolean sharedWithPlayers,
        String downloadUrl,
        UUID createdBy,
        String createdByName,
        Instant createdAt,
        Instant updatedAt
) {}
