package com.prayer.pointfinder.websocket;

import com.prayer.pointfinder.entity.UserRole;
import java.util.UUID;

public final class WebSocketPrincipals {
    private WebSocketPrincipals() {}

    public record UserPrincipal(UUID userId, UserRole role) {}

    /**
     * Player websocket principal. Carries the team id so the subscription
     * authorizer and mobile realtime hub can restrict team-scoped broadcasts
     * (e.g. submission_status) to the owning team's players.
     */
    public record PlayerPrincipal(UUID playerId, UUID gameId, UUID teamId) {}

    public record BroadcastPrincipal(UUID gameId) {}
}
