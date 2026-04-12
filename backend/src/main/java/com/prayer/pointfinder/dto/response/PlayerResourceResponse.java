package com.prayer.pointfinder.dto.response;

import com.prayer.pointfinder.entity.ResourceType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class PlayerResourceResponse {
    private UUID id;
    private ResourceType type;
    private String name;
    private String contentType;
    private String content;
    private Long sizeBytes;
    private String downloadUrl;
    private String source;
}
