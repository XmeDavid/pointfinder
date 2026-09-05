package com.prayer.pointfinder.dto.response;

@lombok.Builder
public record AuthResponse(
        String accessToken,
        String refreshToken,
        UserResponse user
) {}
