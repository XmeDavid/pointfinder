package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class ResourceFolderResponse {
    private UUID id;
    private UUID orgId;
    private UUID gameId;
    private UUID parentId;
    private String name;
    private Instant createdAt;
}
