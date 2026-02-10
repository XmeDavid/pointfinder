package com.dbv.scoutmission.websocket;

import com.dbv.scoutmission.entity.Game;
import com.dbv.scoutmission.entity.User;
import com.dbv.scoutmission.entity.UserRole;
import com.dbv.scoutmission.repository.GameRepository;
import com.dbv.scoutmission.repository.PlayerRepository;
import com.dbv.scoutmission.repository.UserRepository;
import com.dbv.scoutmission.security.JwtTokenProvider;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class WebSocketAuthChannelInterceptor implements ChannelInterceptor {

    private static final String GAME_TOPIC_PREFIX = "/topic/games/";

    private final JwtTokenProvider tokenProvider;
    private final UserRepository userRepository;
    private final PlayerRepository playerRepository;
    private final GameRepository gameRepository;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) {
            return message;
        }

        if (StompCommand.CONNECT.equals(accessor.getCommand())) {
            authenticate(accessor);
        } else if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            authorizeSubscribe(accessor);
        }

        return message;
    }

    private void authenticate(StompHeaderAccessor accessor) {
        String token = extractToken(accessor);
        if (!StringUtils.hasText(token) || !tokenProvider.validateToken(token)) {
            throw new AccessDeniedException("Invalid or missing WebSocket token");
        }

        String tokenType = tokenProvider.getTokenType(token);
        if ("player".equals(tokenType)) {
            authenticatePlayer(token, accessor);
            return;
        }
        authenticateUser(token, accessor);
    }

    private void authenticateUser(String token, StompHeaderAccessor accessor) {
        UUID userId = tokenProvider.getUserIdFromToken(token);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new AccessDeniedException("WebSocket user not found"));

        WebSocketUserPrincipal principal = new WebSocketUserPrincipal(user.getId(), user.getRole());
        var authorities = List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name().toUpperCase()));
        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(principal, null, authorities);
        accessor.setUser(authentication);
    }

    private void authenticatePlayer(String token, StompHeaderAccessor accessor) {
        UUID playerId = tokenProvider.getUserIdFromToken(token);
        if (!playerRepository.existsById(playerId)) {
            throw new AccessDeniedException("WebSocket player not found");
        }

        Claims claims = tokenProvider.getClaims(token);
        String gameIdClaim = claims.get("gameId", String.class);
        if (!StringUtils.hasText(gameIdClaim)) {
            throw new AccessDeniedException("Player token missing game scope");
        }

        UUID gameId;
        try {
            gameId = UUID.fromString(gameIdClaim);
        } catch (IllegalArgumentException ex) {
            throw new AccessDeniedException("Invalid player game scope in token");
        }
        WebSocketPlayerPrincipal principal = new WebSocketPlayerPrincipal(playerId, gameId);
        var authorities = List.of(new SimpleGrantedAuthority("ROLE_PLAYER"));
        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(principal, null, authorities);
        accessor.setUser(authentication);
    }

    private void authorizeSubscribe(StompHeaderAccessor accessor) {
        String destination = accessor.getDestination();
        if (!StringUtils.hasText(destination) || !destination.startsWith(GAME_TOPIC_PREFIX)) {
            return;
        }

        UUID gameId = extractGameId(destination)
                .orElseThrow(() -> new AccessDeniedException("Invalid game topic destination"));

        if (accessor.getUser() == null) {
            throw new AccessDeniedException("WebSocket user is not authenticated");
        }

        Object principal = accessor.getUser();
        if (principal instanceof UsernamePasswordAuthenticationToken auth) {
            principal = auth.getPrincipal();
        }

        if (principal instanceof WebSocketUserPrincipal userPrincipal) {
            authorizeUserSubscription(userPrincipal, gameId);
            return;
        }

        if (principal instanceof WebSocketPlayerPrincipal playerPrincipal) {
            if (!playerPrincipal.gameId().equals(gameId)) {
                throw new AccessDeniedException("Player cannot subscribe to another game topic");
            }
            return;
        }

        throw new AccessDeniedException("Unknown WebSocket principal");
    }

    private void authorizeUserSubscription(WebSocketUserPrincipal principal, UUID gameId) {
        if (principal.role() == UserRole.admin) {
            return;
        }

        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new AccessDeniedException("Game not found"));
        UUID userId = principal.userId();

        boolean isCreator = game.getCreatedBy() != null && game.getCreatedBy().getId().equals(userId);
        boolean isOperator = game.getOperators().stream()
                .anyMatch(operator -> operator.getId().equals(userId));
        if (!isCreator && !isOperator) {
            throw new AccessDeniedException("User cannot subscribe to this game topic");
        }
    }

    private Optional<UUID> extractGameId(String destination) {
        String raw = destination.substring(GAME_TOPIC_PREFIX.length());
        if (!StringUtils.hasText(raw)) {
            return Optional.empty();
        }

        String gameIdSegment = raw.split("/")[0];
        try {
            return Optional.of(UUID.fromString(gameIdSegment));
        } catch (IllegalArgumentException ex) {
            return Optional.empty();
        }
    }

    private String extractToken(StompHeaderAccessor accessor) {
        List<String> authHeaders = accessor.getNativeHeader(HttpHeaders.AUTHORIZATION);
        String bearerToken = (authHeaders != null && !authHeaders.isEmpty()) ? authHeaders.get(0) : null;
        if (!StringUtils.hasText(bearerToken)) {
            return null;
        }

        if (bearerToken.startsWith("Bearer ")) {
            return bearerToken.substring(7);
        }
        return bearerToken;
    }

    private record WebSocketUserPrincipal(UUID userId, UserRole role) {
    }

    private record WebSocketPlayerPrincipal(UUID playerId, UUID gameId) {
    }
}
