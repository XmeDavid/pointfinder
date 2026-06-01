package com.prayer.pointfinder.dto.response;

import lombok.Builder;

import java.util.UUID;

@Builder
public record PlayerResponse(
        UUID id,
        UUID teamId,
        String deviceId,
        String displayName
) {}
