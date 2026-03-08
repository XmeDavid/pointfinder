package com.prayer.pointfinder.websocket;

import com.prayer.pointfinder.entity.UserRole;
import java.util.UUID;

public final class WebSocketPrincipals {
    private WebSocketPrincipals() {}

    public record UserPrincipal(UUID userId, UserRole role) {}
    public record PlayerPrincipal(UUID playerId, UUID gameId) {}
    public record BroadcastPrincipal(UUID gameId) {}
}
