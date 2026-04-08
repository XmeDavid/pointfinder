package com.prayer.pointfinder.websocket;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.service.RealtimeMetricsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tracks mobile-native websocket sessions per game and broadcasts JSON payloads.
 *
 * <p>P0 Track 2 Slice 5 — every register/unregister call also emits the
 * corresponding {@code realtime.mobile.*} Micrometer events through
 * {@link RealtimeMetricsService}. {@code clientId} is the authenticated
 * principal id captured by {@code MobileWebSocketAuthHandshakeInterceptor}
 * in the session attributes; connect/disconnect from the same principal
 * within the metrics service reconnect window is classified as a
 * reconnect. See docs/realtime-and-mobile.md §8.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MobileRealtimeHub {

    private final ObjectMapper objectMapper;
    private final RealtimeMetricsService realtimeMetricsService;

    private static final int MAX_SESSIONS_PER_GAME = 200;

    private final Map<UUID, Set<WebSocketSession>> sessionsByGame = new ConcurrentHashMap<>();
    // Reverse mapping for O(1) lookup during unregister
    private final Map<WebSocketSession, UUID> gameBySession = new ConcurrentHashMap<>();

    public void register(UUID gameId, WebSocketSession session) {
        Set<WebSocketSession> sessions = sessionsByGame.computeIfAbsent(gameId, ignored -> ConcurrentHashMap.newKeySet());
        if (sessions.size() >= MAX_SESSIONS_PER_GAME) {
            log.warn("WebSocket connection limit reached for game {} ({} sessions), rejecting", gameId, sessions.size());
            // Still record the rejected connect so dashboards surface capacity
            // ceilings — tagged as a disconnect with reason=limit_exceeded so
            // the raw connect counter is not over-reported.
            realtimeMetricsService.recordMobileDisconnect(gameId, extractClientId(session), "limit_exceeded");
            try { session.close(); } catch (IOException ignored2) {}
            return;
        }
        sessions.add(session);
        gameBySession.put(session, gameId);
        realtimeMetricsService.recordMobileConnect(gameId, extractClientId(session));
        log.debug("Mobile realtime session connected for game {} (sessions={})", gameId, sessions.size());
    }

    public void unregister(WebSocketSession session) {
        unregister(session, "client_close");
    }

    public void unregister(WebSocketSession session, String reason) {
        UUID gameId = gameBySession.remove(session);
        if (gameId != null) {
            Set<WebSocketSession> sessions = sessionsByGame.get(gameId);
            if (sessions != null) {
                sessions.remove(session);
                if (sessions.isEmpty()) {
                    sessionsByGame.remove(gameId);
                }
            }
            realtimeMetricsService.recordMobileDisconnect(gameId, extractClientId(session), reason);
        }
    }

    private static String extractClientId(WebSocketSession session) {
        Object principalId = session.getAttributes().get("principalId");
        if (principalId == null) {
            return null;
        }
        return principalId.toString();
    }

    public void broadcast(UUID gameId, Object payload) {
        Set<WebSocketSession> sessions = sessionsByGame.get(gameId);
        if (sessions == null || sessions.isEmpty()) {
            return;
        }

        final String json;
        try {
            json = objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize mobile realtime payload for game {}: {}", gameId, e.getMessage());
            return;
        }

        TextMessage message = new TextMessage(json);
        sessions.forEach(session -> sendSafely(gameId, session, message));
    }

    @Scheduled(fixedRate = 60000)
    public void cleanupStaleSessions() {
        // Iterate the reverse map so we still have the (session, gameId)
        // pair and can emit a disconnect event for each swept session.
        // sessionsByGame may still contain the entry; unregister removes
        // it idempotently.
        gameBySession.entrySet().stream()
                .filter(entry -> !entry.getKey().isOpen())
                .toList()
                .forEach(entry -> unregister(entry.getKey(), "stale_cleanup"));
        sessionsByGame.entrySet().removeIf(entry -> entry.getValue().isEmpty());
    }

    private void sendSafely(UUID gameId, WebSocketSession session, TextMessage message) {
        if (!session.isOpen()) {
            unregister(session, "socket_closed");
            return;
        }
        try {
            synchronized (session) {
                session.sendMessage(message);
            }
        } catch (IOException e) {
            log.debug("Failed to send mobile realtime message for game {}: {}", gameId, e.getMessage());
            unregister(session, "send_failure");
        }
    }
}

