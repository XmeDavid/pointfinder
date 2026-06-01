package com.prayer.pointfinder.dto.response;

import lombok.Builder;

import java.time.Instant;
import java.util.UUID;

@Builder
public record UserResponse(
        UUID id,
        String email,
        String name,
        String role,
        Instant createdAt
) {}
