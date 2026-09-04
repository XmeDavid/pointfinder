package com.prayer.pointfinder.dto.response;

import java.util.UUID;

public record PlayerResponse(
        UUID id,
        UUID teamId,
        String deviceId,
        String displayName
) {}
