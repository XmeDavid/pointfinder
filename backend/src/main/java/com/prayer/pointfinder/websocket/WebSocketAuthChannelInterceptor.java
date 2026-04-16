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
import lombok.extern.slf4j.Slf4j;
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

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
@RequiredArgsConstructor
public class WebSocketAuthChannelInterceptor implements ChannelInterceptor {

    private static final String GAME_TOPIC_PREFIX = "/topic/games/";

    /**
     * Per-IP brute-force throttle for broadcast-code auth attempts.
     *
     * <p>Broadcast codes are 6-character tokens with a reduced alphabet
     * (&lt;30 chars, digit-safe). Without a throttle an attacker could try
     * every code in the address space in a few minutes. We lock out an IP
     * for {@link #LOCKOUT_DURATION} once it fires
     * {@link #MAX_FAILED_ATTEMPTS} inside {@link #ATTEMPT_WINDOW}, and we
     * emit a WARN log on every failure so the rate shows up in observability.
     */
    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final Duration ATTEMPT_WINDOW = Duration.ofMinutes(1);
    private static final Duration LOCKOUT_DURATION = Duration.ofMinutes(15);

    private final Map<String, BroadcastAttemptState> broadcastAttempts = new ConcurrentHashMap<>();

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
        String remoteIp = extractRemoteIp(accessor);
        enforceBroadcastThrottle(remoteIp);

        var gameOpt = gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(code);
        if (gameOpt.isEmpty()) {
            recordBroadcastFailure(remoteIp, code);
            throw new AccessDeniedException("Invalid broadcast code");
        }
        var game = gameOpt.get();
        // Successful auth resets the per-IP counter so a legitimate viewer
        // who miskeyed once is not punished indefinitely.
        broadcastAttempts.remove(remoteIp);
        WebSocketPrincipals.BroadcastPrincipal principal = new WebSocketPrincipals.BroadcastPrincipal(game.getId());
        var authorities = List.of(new SimpleGrantedAuthority("ROLE_BROADCAST_VIEWER"));
        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(principal, null, authorities);
        accessor.setUser(authentication);
    }

    private void enforceBroadcastThrottle(String remoteIp) {
        BroadcastAttemptState state = broadcastAttempts.get(remoteIp);
        if (state == null) {
            return;
        }
        Instant now = Instant.now();
        if (state.lockedUntil != null && now.isBefore(state.lockedUntil)) {
            log.warn("Broadcast-code auth blocked: ip={} locked_until={} (attempts={})",
                    remoteIp, state.lockedUntil, state.failureCount);
            throw new AccessDeniedException("Too many invalid broadcast-code attempts");
        }
    }

    private void recordBroadcastFailure(String remoteIp, String code) {
        Instant now = Instant.now();
        BroadcastAttemptState updated = broadcastAttempts.compute(remoteIp, (ip, prev) -> {
            if (prev == null || now.isAfter(prev.windowStart.plus(ATTEMPT_WINDOW))
                    || (prev.lockedUntil != null && now.isAfter(prev.lockedUntil))) {
                return new BroadcastAttemptState(now, 1, null);
            }
            int next = prev.failureCount + 1;
            Instant lockedUntil = next >= MAX_FAILED_ATTEMPTS ? now.plus(LOCKOUT_DURATION) : null;
            return new BroadcastAttemptState(prev.windowStart, next, lockedUntil);
        });
        // Never log the attempted code — it could be valid for another game.
        log.warn("Broadcast-code auth failed: ip={} attempts={} locked_until={}",
                remoteIp, updated.failureCount, updated.lockedUntil);
    }

    private String extractRemoteIp(StompHeaderAccessor accessor) {
        // Prefer upstream proxy headers so the throttle sees the real client
        // behind nginx, not the loopback the backend sees directly. Fallback
        // to the STOMP session id so each session is isolated when no header
        // is available (tests, direct non-proxied connections).
        List<String> forwarded = accessor.getNativeHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isEmpty()) {
            String first = forwarded.get(0);
            if (StringUtils.hasText(first)) {
                int comma = first.indexOf(',');
                return (comma > 0 ? first.substring(0, comma) : first).trim();
            }
        }
        List<String> realIp = accessor.getNativeHeader("X-Real-IP");
        if (realIp != null && !realIp.isEmpty() && StringUtils.hasText(realIp.get(0))) {
            return realIp.get(0).trim();
        }
        String sessionId = accessor.getSessionId();
        return StringUtils.hasText(sessionId) ? "session:" + sessionId : "unknown";
    }

    private record BroadcastAttemptState(Instant windowStart, int failureCount, Instant lockedUntil) {}

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

        // Team id is REQUIRED on player tokens so team-scoped sub-topic
        // authorization and sanitized mobile fan-out can enforce ownership
        // without a round-trip to the player table on every SUBSCRIBE.
        String teamIdClaim = claims.get("teamId", String.class);
        if (!StringUtils.hasText(teamIdClaim)) {
            throw new AccessDeniedException("Player token missing team scope");
        }
        UUID teamId;
        try {
            teamId = UUID.fromString(teamIdClaim);
        } catch (IllegalArgumentException ex) {
            throw new AccessDeniedException("Invalid player team scope in token");
        }
        WebSocketPrincipals.PlayerPrincipal principal = new WebSocketPrincipals.PlayerPrincipal(playerId, gameId, teamId);
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

        SubTopic subTopic = parseSubTopic(destination, gameId);

        if (principal instanceof WebSocketPrincipals.UserPrincipal userPrincipal) {
            // Operators/admins authenticate the game once; operator/team
            // sub-topics both resolve to operator visibility. Operators may
            // introspect any team sub-topic to monitor review decisions.
            authorizeUserSubscription(userPrincipal, gameId);
            return;
        }

        if (principal instanceof WebSocketPrincipals.PlayerPrincipal playerPrincipal) {
            if (!playerPrincipal.gameId().equals(gameId)) {
                throw new AccessDeniedException("Player cannot subscribe to another game topic");
            }
            // Players MUST NOT tap the operator sub-topic even with a valid
            // team id — that channel carries points, feedback, and reviewer
            // ids that the player app is contractually forbidden from
            // seeing (CLAUDE.md "Players don't see scores or leaderboards").
            if (subTopic.audience() == Audience.OPERATOR) {
                throw new AccessDeniedException("Player cannot subscribe to operator sub-topic");
            }
            // A player-authenticated principal can only read their own team
            // sub-topic. Cross-team peeks would re-leak submission review
            // metadata.
            if (subTopic.audience() == Audience.TEAM
                    && !playerPrincipal.teamId().equals(subTopic.teamId())) {
                throw new AccessDeniedException("Player cannot subscribe to another team sub-topic");
            }
            return;
        }

        if (principal instanceof WebSocketPrincipals.BroadcastPrincipal broadcastPrincipal) {
            if (!broadcastPrincipal.gameId().equals(gameId)) {
                throw new AccessDeniedException("Broadcast viewer cannot subscribe to another game topic");
            }
            // Broadcast viewers are spectators — never expose the operator
            // sub-topic or per-team sub-topics to an anonymous viewer.
            if (subTopic.audience() != Audience.LEGACY) {
                throw new AccessDeniedException("Broadcast viewer cannot subscribe to scoped sub-topic");
            }
            return;
        }

        throw new AccessDeniedException("Unknown WebSocket principal");
    }

    /**
     * Sub-topic classification derived from the STOMP destination tail. The
     * destination shape is {@code /topic/games/{gameId}/{tail}} where
     * {@code tail} is either empty (legacy game-wide channel),
     * {@code operator/{type}} (operator-only fan-out), or
     * {@code team/{teamId}/{type}} (team-scoped fan-out).
     */
    private record SubTopic(Audience audience, UUID teamId) {
        static SubTopic legacy() {
            return new SubTopic(Audience.LEGACY, null);
        }

        static SubTopic operator() {
            return new SubTopic(Audience.OPERATOR, null);
        }

        static SubTopic team(UUID teamId) {
            return new SubTopic(Audience.TEAM, teamId);
        }
    }

    private enum Audience {
        /** Legacy {@code /topic/games/{gameId}/...} channels open to all principals that can access the game. */
        LEGACY,
        /** {@code /topic/games/{gameId}/operator/...} channels reserved for operators/admins. */
        OPERATOR,
        /** {@code /topic/games/{gameId}/team/{teamId}/...} channels restricted to the owning team and operators. */
        TEAM,
    }

    private SubTopic parseSubTopic(String destination, UUID gameId) {
        String tail = destination.substring(GAME_TOPIC_PREFIX.length());
        int slash = tail.indexOf('/');
        if (slash < 0) {
            return SubTopic.legacy();
        }
        String rest = tail.substring(slash + 1);
        if (!StringUtils.hasText(rest)) {
            return SubTopic.legacy();
        }
        if (rest.startsWith("operator/") || rest.equals("operator")) {
            return SubTopic.operator();
        }
        if (rest.startsWith("team/")) {
            String teamSegment = rest.substring("team/".length());
            int nextSlash = teamSegment.indexOf('/');
            String teamIdStr = nextSlash < 0 ? teamSegment : teamSegment.substring(0, nextSlash);
            if (!StringUtils.hasText(teamIdStr)) {
                throw new AccessDeniedException("Invalid team sub-topic destination");
            }
            try {
                return SubTopic.team(UUID.fromString(teamIdStr));
            } catch (IllegalArgumentException ex) {
                throw new AccessDeniedException("Invalid team id in sub-topic destination");
            }
        }
        return SubTopic.legacy();
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
