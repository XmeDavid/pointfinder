package com.prayer.pointfinder.dto.response;

import java.util.UUID;

public record TeamResponse(
        UUID id,
        UUID gameId,
        String name,
        String joinCode,
        String color
) {}
