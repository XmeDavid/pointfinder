package com.prayer.pointfinder.dto.response;

import com.prayer.pointfinder.entity.ResourceType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class ResourceResponse {
    private UUID id;
    private UUID orgId;
    private UUID gameId;
    private UUID folderId;
    private ResourceType type;
    private String name;
    private String contentType;
    private String content;
    private Long sizeBytes;
    private Boolean sharedWithPlayers;
    private String downloadUrl;
    private UUID createdBy;
    private String createdByName;
    private Instant createdAt;
    private Instant updatedAt;
}
