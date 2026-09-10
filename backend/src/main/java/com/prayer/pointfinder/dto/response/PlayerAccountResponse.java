package com.prayer.pointfinder.dto.response;

/** What the player app shows under Settings → Account. Never carries scores or operator data. */
public record PlayerAccountResponse(
        boolean linked,
        String email,
        String name,
        boolean emailVerified
) {
    public static PlayerAccountResponse guest() {
        return new PlayerAccountResponse(false, null, null, false);
    }
}
