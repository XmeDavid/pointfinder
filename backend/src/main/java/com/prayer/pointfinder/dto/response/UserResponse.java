package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.UUID;

public record UserResponse(
        UUID id,
        String email,
        String name,
        String role,
        Instant createdAt
) {}
