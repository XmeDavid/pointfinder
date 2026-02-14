package com.prayer.pointfinder.websocket;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MobileRealtimeHub {

    private final ObjectMapper objectMapper;

    private final Map<UUID, Set<WebSocketSession>> sessionsByGame = new ConcurrentHashMap<>();

    public void register(UUID gameId, WebSocketSession session) {
        Set<WebSocketSession> sessions = sessionsByGame.computeIfAbsent(gameId, ignored -> ConcurrentHashMap.newKeySet());
        sessions.add(session);
        log.debug("Mobile realtime session connected for game {} (sessions={})", gameId, sessions.size());
    }

    public void unregister(WebSocketSession session) {
        sessionsByGame.values().forEach(sessions -> sessions.remove(session));
        sessionsByGame.entrySet().removeIf(entry -> entry.getValue().isEmpty());
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

    private void sendSafely(UUID gameId, WebSocketSession session, TextMessage message) {
        if (!session.isOpen()) {
            unregister(session);
            return;
        }
        try {
            synchronized (session) {
                session.sendMessage(message);
            }
        } catch (IOException e) {
            log.debug("Failed to send mobile realtime message for game {}: {}", gameId, e.getMessage());
            unregister(session);
        }
    }
}

