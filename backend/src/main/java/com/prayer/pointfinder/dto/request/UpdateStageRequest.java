package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

@Data
public class UpdateStageRequest {
    @NotBlank
    private String name;

    private String description;

    @NotBlank
    private String transitionType;

    private OffsetDateTime scheduledAt;

    private UUID triggerBaseId;
}
