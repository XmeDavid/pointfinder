package com.prayer.pointfinder.realtime;

import java.util.Map;
import java.util.UUID;

/**
 * One fan-out of a realtime envelope to one audience. The envelope is the
 * same map {@code GameEventBroadcaster} always built ({@code version},
 * {@code type}, {@code gameId}, {@code emittedAt}, {@code stateVersion},
 * {@code data}); the audience decides the STOMP destination and which mobile
 * sessions receive it.
 */
public record RealtimeEvent(
        Audience audience,
        UUID gameId,
        UUID teamId,
        String type,
        Map<String, Object> envelope
) {

    public enum Audience {
        /** Every principal subscribed to the game: {@code /topic/games/{gameId}}. */
        ALL,
        /** Operators and admins only: {@code /topic/games/{gameId}/operator/{type}}. */
        OPERATOR,
        /** The owning team's players plus operators: {@code /topic/games/{gameId}/team/{teamId}/{type}}. */
        TEAM
    }

    public static RealtimeEvent all(UUID gameId, String type, Map<String, Object> envelope) {
        return new RealtimeEvent(Audience.ALL, gameId, null, type, envelope);
    }

    public static RealtimeEvent operator(UUID gameId, String type, Map<String, Object> envelope) {
        return new RealtimeEvent(Audience.OPERATOR, gameId, null, type, envelope);
    }

    public static RealtimeEvent team(UUID gameId, UUID teamId, String type, Map<String, Object> envelope) {
        return new RealtimeEvent(Audience.TEAM, gameId, teamId, type, envelope);
    }

    public String destination() {
        String base = "/topic/games/" + gameId;
        return switch (audience) {
            case ALL -> base;
            case OPERATOR -> base + "/operator/" + type;
            case TEAM -> base + "/team/" + teamId + "/" + type;
        };
    }
}
