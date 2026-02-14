package com.dbv.scoutmission.websocket;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.UUID;

/**
 * Plain websocket handler used by mobile clients.
 * Incoming messages are currently ignored; server only pushes events.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MobileRealtimeWebSocketHandler extends TextWebSocketHandler {

    public static final String ATTR_GAME_ID = "gameId";

    private final MobileRealtimeHub mobileRealtimeHub;

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        UUID gameId = extractGameId(session);
        if (gameId == null) {
            closeQuietly(session, CloseStatus.POLICY_VIOLATION);
            return;
        }
        mobileRealtimeHub.register(gameId, session);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        // Server push channel only; no client message handling required yet.
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        mobileRealtimeHub.unregister(session);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.debug("Mobile websocket transport error: {}", exception.getMessage());
        mobileRealtimeHub.unregister(session);
        closeQuietly(session, CloseStatus.SERVER_ERROR);
    }

    private UUID extractGameId(WebSocketSession session) {
        Object gameId = session.getAttributes().get(ATTR_GAME_ID);
        if (gameId instanceof UUID uuid) {
            return uuid;
        }
        if (gameId instanceof String value) {
            try {
                return UUID.fromString(value);
            } catch (IllegalArgumentException ignored) {
                return null;
            }
        }
        return null;
    }

    private void closeQuietly(WebSocketSession session, CloseStatus status) {
        try {
            if (session.isOpen()) {
                session.close(status);
            }
        } catch (Exception ignored) {
            // Ignore close failures.
        }
    }
}

