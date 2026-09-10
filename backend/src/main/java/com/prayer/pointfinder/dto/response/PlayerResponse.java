package com.prayer.pointfinder.dto.response;

import java.util.UUID;

@lombok.Builder
public record PlayerResponse(
        UUID id,
        UUID teamId,
        String deviceId,
        String displayName,
        /** PF-01: the participation is saved to an account. Never the address. */
        boolean hasAccount
) {}
