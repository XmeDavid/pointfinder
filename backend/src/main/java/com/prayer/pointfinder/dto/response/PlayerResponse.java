package com.prayer.pointfinder.dto.response;

import java.util.UUID;

@lombok.Builder
public record PlayerResponse(
        UUID id,
        UUID teamId,
        String deviceId,
        String displayName
) {}
