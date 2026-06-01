package com.prayer.pointfinder.dto.response;

import lombok.Builder;

import java.util.UUID;

@Builder
public record TeamResponse(
        UUID id,
        UUID gameId,
        String name,
        String joinCode,
        String color
) {}
