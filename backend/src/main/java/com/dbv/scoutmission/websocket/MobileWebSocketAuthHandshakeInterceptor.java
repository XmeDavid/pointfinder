package com.dbv.scoutmission.websocket;

import com.dbv.scoutmission.entity.Game;
import com.dbv.scoutmission.entity.User;
import com.dbv.scoutmission.entity.UserRole;
import com.dbv.scoutmission.repository.GameRepository;
import com.dbv.scoutmission.repository.UserRepository;
import com.dbv.scoutmission.security.JwtTokenProvider;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Authorizes plain websocket handshakes for mobile realtime clients.
 *
 * <p>Auth rules:
 * <ul>
 *   <li>Player token: game scope is taken from token claims.</li>
 *   <li>User token (admin/operator): requires gameId query param and access validation.</li>
 * </ul>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MobileWebSocketAuthHandshakeInterceptor implements HandshakeInterceptor {

    private static final String QUERY_GAME_ID = "gameId";
    private static final String QUERY_TOKEN = "token";

    private final JwtTokenProvider tokenProvider;
    private final UserRepository userRepository;
    private final GameRepository gameRepository;

    @Override
    public boolean beforeHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            Map<String, Object> attributes
    ) {
        String token = resolveToken(request);
        if (!StringUtils.hasText(token) || !tokenProvider.validateToken(token)) {
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }

        String tokenType = tokenProvider.getTokenType(token);
        if ("player".equals(tokenType)) {
            return authorizePlayer(token, response, attributes);
        }
        return authorizeUser(request, token, response, attributes);
    }

    @Override
    public void afterHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            Exception exception
    ) {
        // No-op.
    }

    private boolean authorizePlayer(String token, ServerHttpResponse response, Map<String, Object> attributes) {
        Claims claims = tokenProvider.getClaims(token);
        String gameIdValue = claims.get("gameId", String.class);
        if (!StringUtils.hasText(gameIdValue)) {
            response.setStatusCode(HttpStatus.FORBIDDEN);
            return false;
        }
        try {
            UUID gameId = UUID.fromString(gameIdValue);
            attributes.put(MobileRealtimeWebSocketHandler.ATTR_GAME_ID, gameId);
            attributes.put("principalType", "player");
            attributes.put("principalId", tokenProvider.getUserIdFromToken(token));
            return true;
        } catch (IllegalArgumentException e) {
            response.setStatusCode(HttpStatus.FORBIDDEN);
            return false;
        }
    }

    private boolean authorizeUser(
            ServerHttpRequest request,
            String token,
            ServerHttpResponse response,
            Map<String, Object> attributes
    ) {
        MultiValueMap<String, String> params = UriComponentsBuilder.fromUri(request.getURI()).build().getQueryParams();
        String gameIdParam = params.getFirst(QUERY_GAME_ID);
        if (!StringUtils.hasText(gameIdParam)) {
            response.setStatusCode(HttpStatus.BAD_REQUEST);
            return false;
        }

        final UUID gameId;
        try {
            gameId = UUID.fromString(gameIdParam);
        } catch (IllegalArgumentException ex) {
            response.setStatusCode(HttpStatus.BAD_REQUEST);
            return false;
        }

        UUID userId = tokenProvider.getUserIdFromToken(token);
        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) {
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }

        User user = userOpt.get();
        if (!canAccessGame(user, gameId)) {
            response.setStatusCode(HttpStatus.FORBIDDEN);
            return false;
        }

        attributes.put(MobileRealtimeWebSocketHandler.ATTR_GAME_ID, gameId);
        attributes.put("principalType", "user");
        attributes.put("principalId", userId);
        return true;
    }

    private boolean canAccessGame(User user, UUID gameId) {
        if (user.getRole() == UserRole.admin) {
            return gameRepository.existsById(gameId);
        }

        Optional<Game> gameOpt = gameRepository.findById(gameId);
        if (gameOpt.isEmpty()) {
            return false;
        }

        Game game = gameOpt.get();
        UUID userId = user.getId();
        if (game.getCreatedBy() != null && userId.equals(game.getCreatedBy().getId())) {
            return true;
        }

        return game.getOperators().stream().anyMatch(op -> userId.equals(op.getId()));
    }

    private String resolveToken(ServerHttpRequest request) {
        String authHeader = request.getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
        if (StringUtils.hasText(authHeader)) {
            if (authHeader.startsWith("Bearer ")) {
                return authHeader.substring(7);
            }
            return authHeader;
        }

        MultiValueMap<String, String> params = UriComponentsBuilder.fromUri(request.getURI()).build().getQueryParams();
        return params.getFirst(QUERY_TOKEN);
    }
}

