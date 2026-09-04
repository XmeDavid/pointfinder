package com.prayer.pointfinder.dto.response;

import com.prayer.pointfinder.entity.ResourceType;

import java.util.UUID;

public record PlayerResourceResponse(
    UUID id,
    ResourceType type,
    String name,
    String contentType,
    String content,
    Long sizeBytes,
    String downloadUrl,
    String source
) {}
