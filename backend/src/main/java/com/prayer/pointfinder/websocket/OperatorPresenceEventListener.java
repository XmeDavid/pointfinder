package com.prayer.pointfinder.websocket;

import com.prayer.pointfinder.entity.UserRole;
import com.prayer.pointfinder.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import org.springframework.web.socket.messaging.SessionSubscribeEvent;

import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
@Slf4j
public class OperatorPresenceEventListener {

    private static final String GAME_TOPIC_PREFIX = "/topic/games/";

    private final OperatorPresenceTracker presenceTracker;
    private final GameEventBroadcaster eventBroadcaster;
    private final UserRepository userRepository;

    @EventListener
    public void handleSubscribe(SessionSubscribeEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String destination = accessor.getDestination();
        String sessionId = accessor.getSessionId();

        if (destination == null || !destination.startsWith(GAME_TOPIC_PREFIX) || sessionId == null) {
            return;
        }

        WebSocketPrincipals.UserPrincipal principal = extractUserPrincipal(accessor);
        if (principal == null) return;

        if (principal.role() != UserRole.admin && principal.role() != UserRole.operator) {
            return;
        }

        UUID gameId = extractGameId(destination);
        if (gameId == null) return;

        String name = userRepository.findById(principal.userId())
                .map(u -> u.getName())
                .orElse("Unknown");

        presenceTracker.register(sessionId, gameId, principal.userId(), name);
        // Delay broadcast to allow the broker to register the subscription.
        // SessionSubscribeEvent fires before the async broker processes the
        // SUBSCRIBE frame, so broadcasting immediately misses the new subscriber.
        CompletableFuture.delayedExecutor(500, TimeUnit.MILLISECONDS)
                .execute(() -> broadcastPresence(gameId));
    }

    @EventListener
    public void handleDisconnect(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String sessionId = accessor.getSessionId();
        if (sessionId == null) return;

        UUID gameId = presenceTracker.unregister(sessionId);
        if (gameId != null) {
            broadcastPresence(gameId);
        }
    }

    private void broadcastPresence(UUID gameId) {
        Set<OperatorPresenceTracker.OperatorInfo> operators = presenceTracker.getOperators(gameId);
        List<Map<String, Object>> operatorList = operators.stream()
                .map(op -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("id", op.userId());
                    m.put("name", op.name());
                    m.put("initials", op.initials());
                    return m;
                })
                .toList();

        Map<String, Object> data = new HashMap<>();
        data.put("operators", operatorList);
        eventBroadcaster.broadcastPresence(gameId, data);
    }

    private WebSocketPrincipals.UserPrincipal extractUserPrincipal(StompHeaderAccessor accessor) {
        if (accessor.getUser() instanceof UsernamePasswordAuthenticationToken auth
                && auth.getPrincipal() instanceof WebSocketPrincipals.UserPrincipal userPrincipal) {
            return userPrincipal;
        }
        return null;
    }

    private UUID extractGameId(String destination) {
        String raw = destination.substring(GAME_TOPIC_PREFIX.length());
        String segment = raw.split("/")[0];
        try {
            return UUID.fromString(segment);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
