package com.prayer.pointfinder.websocket;

import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserRole;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.PlayerRepository;
import com.prayer.pointfinder.repository.UserRepository;
import com.prayer.pointfinder.security.JwtTokenProvider;
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
        // Check for broadcast viewer first (no JWT required)
        List<String> broadcastHeaders = accessor.getNativeHeader("X-Broadcast-Code");
        String broadcastCode = (broadcastHeaders != null && !broadcastHeaders.isEmpty()) ? broadcastHeaders.get(0) : null;
        if (StringUtils.hasText(broadcastCode)) {
            authenticateBroadcastViewer(broadcastCode.toUpperCase(), accessor);
            return;
        }

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

    private void authenticateBroadcastViewer(String code, StompHeaderAccessor accessor) {
        var game = gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(code)
                .orElseThrow(() -> new AccessDeniedException("Invalid broadcast code"));
        WebSocketPrincipals.BroadcastPrincipal principal = new WebSocketPrincipals.BroadcastPrincipal(game.getId());
        var authorities = List.of(new SimpleGrantedAuthority("ROLE_BROADCAST_VIEWER"));
        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(principal, null, authorities);
        accessor.setUser(authentication);
    }

    private void authenticateUser(String token, StompHeaderAccessor accessor) {
        UUID userId = tokenProvider.getUserIdFromToken(token);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new AccessDeniedException("WebSocket user not found"));

        WebSocketPrincipals.UserPrincipal principal = new WebSocketPrincipals.UserPrincipal(user.getId(), user.getRole());
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
        WebSocketPrincipals.PlayerPrincipal principal = new WebSocketPrincipals.PlayerPrincipal(playerId, gameId);
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

        if (principal instanceof WebSocketPrincipals.UserPrincipal userPrincipal) {
            authorizeUserSubscription(userPrincipal, gameId);
            return;
        }

        if (principal instanceof WebSocketPrincipals.PlayerPrincipal playerPrincipal) {
            if (!playerPrincipal.gameId().equals(gameId)) {
                throw new AccessDeniedException("Player cannot subscribe to another game topic");
            }
            return;
        }

        if (principal instanceof WebSocketPrincipals.BroadcastPrincipal broadcastPrincipal) {
            if (!broadcastPrincipal.gameId().equals(gameId)) {
                throw new AccessDeniedException("Broadcast viewer cannot subscribe to another game topic");
            }
            return;
        }

        throw new AccessDeniedException("Unknown WebSocket principal");
    }

    private void authorizeUserSubscription(WebSocketPrincipals.UserPrincipal principal, UUID gameId) {
        if (principal.role() == UserRole.admin) {
            return;
        }

        UUID userId = principal.userId();

        // Use a COUNT query to avoid lazy-loading the operators collection
        // (loading it outside a transaction causes LazyInitializationException
        // with open-in-view disabled)
        if (!gameRepository.isUserOperator(gameId, userId)) {
            // Also check if they're the game creator
            Game game = gameRepository.findById(gameId)
                    .orElseThrow(() -> new AccessDeniedException("Game not found"));
            boolean isCreator = game.getCreatedBy() != null && game.getCreatedBy().getId().equals(userId);
            if (!isCreator) {
                throw new AccessDeniedException("User cannot subscribe to this game topic");
            }
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


}
