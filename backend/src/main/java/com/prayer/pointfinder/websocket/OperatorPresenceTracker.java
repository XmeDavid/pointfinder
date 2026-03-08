package com.prayer.pointfinder.websocket;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Component
@Slf4j
public class OperatorPresenceTracker {

    public record OperatorInfo(UUID userId, String name, String initials) {}

    private record SessionInfo(UUID gameId, UUID userId) {}

    private final ConcurrentHashMap<UUID, Set<OperatorInfo>> presenceByGame = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, SessionInfo> sessionMap = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<UUID, Integer> sessionCount = new ConcurrentHashMap<>();

    public void register(String sessionId, UUID gameId, UUID userId, String name) {
        String initials = computeInitials(name);
        OperatorInfo info = new OperatorInfo(userId, name, initials);
        sessionMap.put(sessionId, new SessionInfo(gameId, userId));
        int count = sessionCount.merge(userId, 1, Integer::sum);
        if (count == 1) {
            presenceByGame.computeIfAbsent(gameId, k -> ConcurrentHashMap.newKeySet()).add(info);
            log.info("Operator {} joined game {} (session {})", name, gameId, sessionId);
        }
    }

    public UUID unregister(String sessionId) {
        SessionInfo info = sessionMap.remove(sessionId);
        if (info == null) return null;
        int remaining = sessionCount.merge(info.userId(), -1, Integer::sum);
        if (remaining <= 0) {
            sessionCount.remove(info.userId());
            Set<OperatorInfo> operators = presenceByGame.get(info.gameId());
            if (operators != null) {
                operators.removeIf(op -> op.userId().equals(info.userId()));
                if (operators.isEmpty()) {
                    presenceByGame.remove(info.gameId());
                }
            }
            log.info("Operator {} left game {} (session {})", info.userId(), info.gameId(), sessionId);
        }
        return info.gameId();
    }

    public Set<OperatorInfo> getOperators(UUID gameId) {
        Set<OperatorInfo> operators = presenceByGame.get(gameId);
        return operators != null ? Collections.unmodifiableSet(operators) : Collections.emptySet();
    }

    private static String computeInitials(String name) {
        if (name == null || name.isBlank()) return "?";
        String[] parts = name.trim().split("\\s+");
        if (parts.length >= 2) {
            return ("" + parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
        }
        return parts[0].substring(0, 1).toUpperCase();
    }
}
