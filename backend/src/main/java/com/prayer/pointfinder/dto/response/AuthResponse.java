package com.prayer.pointfinder.dto.response;

import lombok.Builder;

@Builder
public record AuthResponse(
        String accessToken,
        String refreshToken,
        UserResponse user
) {}
