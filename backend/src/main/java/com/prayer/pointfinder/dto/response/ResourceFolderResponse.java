package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.UUID;

public record ResourceFolderResponse(
    UUID id,
    UUID orgId,
    UUID gameId,
    UUID parentId,
    String name,
    Instant createdAt
) {}
