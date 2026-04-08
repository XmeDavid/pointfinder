package com.prayer.pointfinder.websocket;

import com.prayer.pointfinder.service.RealtimeMetricsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import org.springframework.web.socket.messaging.SessionSubscribeEvent;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Feeds STOMP subscribe/disconnect lifecycle events into
 * {@link RealtimeMetricsService} (P0 Track 2 Slice 5).
 *
 * <h2>Why subscribe, not connect?</h2>
 *
 * A bare STOMP {@code CONNECT} frame does not yet carry a game id —
 * the client authenticates first and only picks a topic on
 * {@code SUBSCRIBE}. This listener counts a connect the first time a
 * given STOMP session id subscribes to a per-game topic. Subsequent
 * subscriptions from the same session (e.g. when a view mounts another
 * sub-topic) do not double-count.
 *
 * <h2>Disconnect path</h2>
 *
 * {@link SessionDisconnectEvent} fires once per STOMP session and carries
 * its id and {@link org.springframework.web.socket.CloseStatus}. We look
 * up the remembered {@code (sessionId -> gameId)} mapping and emit a
 * disconnect on the metrics service.
 *
 * <h2>Client id for reconnect detection</h2>
 *
 * For operator/admin principals we use the {@code userId}. This works as
 * a reconnect fingerprint even when the browser picks a brand new STOMP
 * session id across WebSocket drops: the JWT principal stays the same.
 * Players and broadcast viewers are never counted on the STOMP hub —
 * the web admin is operator-facing only.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class StompSessionMetricsListener {

    private static final String GAME_TOPIC_PREFIX = "/topic/games/";

    private final RealtimeMetricsService realtimeMetricsService;

    /**
     * {@code sessionId -> (gameId, clientId)} so {@code SessionDisconnectEvent}
     * (which only carries the session id) can emit a properly tagged
     * disconnect.
     */
    private final Map<String, TrackedSession> tracked = new ConcurrentHashMap<>();

    private record TrackedSession(UUID gameId, String clientId) {}

    @EventListener
    public void onSubscribe(SessionSubscribeEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String sessionId = accessor.getSessionId();
        String destination = accessor.getDestination();

        if (sessionId == null || destination == null || !destination.startsWith(GAME_TOPIC_PREFIX)) {
            return;
        }

        UUID gameId = extractGameId(destination);
        if (gameId == null) return;

        // First-subscribe-per-session wins. Reuse the same client id for the
        // life of the session so disconnect can tag it correctly.
        TrackedSession previous = tracked.putIfAbsent(
                sessionId,
                new TrackedSession(gameId, extractClientId(accessor))
        );
        if (previous != null) {
            return;
        }

        TrackedSession current = tracked.get(sessionId);
        realtimeMetricsService.recordStompConnect(gameId, current.clientId());
        if (log.isDebugEnabled()) {
            log.debug("STOMP subscribe session={} game={} client={}", sessionId, gameId, current.clientId());
        }
    }

    @EventListener
    public void onDisconnect(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String sessionId = accessor.getSessionId();
        if (sessionId == null) return;

        TrackedSession info = tracked.remove(sessionId);
        if (info == null) return;

        String reason = event.getCloseStatus() != null
                ? "status_" + event.getCloseStatus().getCode()
                : "unknown";
        realtimeMetricsService.recordStompDisconnect(info.gameId(), info.clientId(), reason);
        if (log.isDebugEnabled()) {
            log.debug("STOMP disconnect session={} game={} client={} reason={}",
                    sessionId, info.gameId(), info.clientId(), reason);
        }
    }

    private UUID extractGameId(String destination) {
        String raw = destination.substring(GAME_TOPIC_PREFIX.length());
        String segment = raw.split("/")[0];
        try {
            return UUID.fromString(segment);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private String extractClientId(StompHeaderAccessor accessor) {
        Object principal = accessor.getUser();
        if (principal instanceof UsernamePasswordAuthenticationToken auth) {
            principal = auth.getPrincipal();
        }
        if (principal instanceof WebSocketPrincipals.UserPrincipal userPrincipal) {
            return userPrincipal.userId().toString();
        }
        if (principal instanceof WebSocketPrincipals.PlayerPrincipal playerPrincipal) {
            return "player:" + playerPrincipal.playerId();
        }
        if (principal instanceof WebSocketPrincipals.BroadcastPrincipal broadcastPrincipal) {
            return "broadcast:" + broadcastPrincipal.gameId();
        }
        return null;
    }
}
