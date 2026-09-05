package com.prayer.pointfinder.dto.response;

import java.util.UUID;

@lombok.Builder
public record TeamResponse(
        UUID id,
        UUID gameId,
        String name,
        String joinCode,
        String color
) {}
