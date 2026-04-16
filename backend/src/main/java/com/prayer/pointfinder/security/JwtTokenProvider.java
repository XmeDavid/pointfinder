package com.prayer.pointfinder.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

@Slf4j
@Component
public class JwtTokenProvider {

    private static final String INSECURE_DEFAULT_SECRET =
            "scout-mission-dev-secret-key-that-is-at-least-256-bits-long-for-hs256";

    @Value("${app.jwt.secret}")
    private String jwtSecret;

    @Value("${app.jwt.access-token-expiration-ms}")
    private long accessTokenExpirationMs;

    @Value("${app.jwt.refresh-token-expiration-ms}")
    private long refreshTokenExpirationMs;

    @Value("${app.jwt.enforce-prod-secret:true}")
    private boolean enforceProdSecret;

    private SecretKey key;
    private final Environment environment;

    public JwtTokenProvider(Environment environment) {
        this.environment = environment;
    }

    @PostConstruct
    public void init() {
        validateSecretConfiguration();
        this.key = Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
    }

    private static final String ISSUER = "pointfinder";
    private static final String AUDIENCE = "pointfinder-api";

    public String generateAccessToken(UUID userId, String email, String role) {
        return generateAccessToken(userId, email, role, 0);
    }

    /**
     * Access token minted with an explicit {@code tokenVersion} claim. Callers
     * that have the current {@link com.prayer.pointfinder.entity.User} entity
     * in hand should prefer this overload so the token tracks the user's
     * live invalidation counter; otherwise the legacy 3-arg overload mints a
     * token with {@code tv=0}, which is still valid for accounts that have
     * not bumped their version since migration V54.
     */
    public String generateAccessToken(UUID userId, String email, String role, int tokenVersion) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + accessTokenExpirationMs);

        return Jwts.builder()
                .issuer(ISSUER)
                .audience().add(AUDIENCE).and()
                .subject(userId.toString())
                .claim("email", email)
                .claim("role", role)
                .claim("type", "user")
                .claim("tv", tokenVersion)
                .issuedAt(now)
                .expiration(expiry)
                .signWith(key)
                .compact();
    }

    public String generatePlayerToken(UUID playerId, UUID teamId, UUID gameId) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + refreshTokenExpirationMs); // longer-lived for players

        return Jwts.builder()
                .issuer(ISSUER)
                .audience().add(AUDIENCE).and()
                .subject(playerId.toString())
                .claim("teamId", teamId.toString())
                .claim("gameId", gameId.toString())
                .claim("type", "player")
                .claim("role", "player")
                .issuedAt(now)
                .expiration(expiry)
                .signWith(key)
                .compact();
    }

    public String generateRefreshTokenString() {
        return UUID.randomUUID().toString();
    }

    public long getRefreshTokenExpirationMs() {
        return refreshTokenExpirationMs;
    }

    public UUID getUserIdFromToken(String token) {
        Claims claims = getClaims(token);
        return UUID.fromString(claims.getSubject());
    }

    public String getTokenType(String token) {
        Claims claims = getClaims(token);
        String type = claims.get("type", String.class);
        if (type == null) {
            throw new JwtException("Token missing required 'type' claim");
        }
        return type;
    }

    /**
     * Extracts the token's {@code tv} claim. Tokens minted before V54 do not
     * carry the claim — those return 0 (the default user value) so pre-bump
     * tokens keep working without forcing a mass logout at rollout time.
     */
    public int getTokenVersion(String token) {
        Claims claims = getClaims(token);
        Integer tv = claims.get("tv", Integer.class);
        return tv == null ? 0 : tv;
    }

    public Claims getClaims(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .requireIssuer(ISSUER)
                .requireAudience(AUDIENCE)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public boolean validateToken(String token) {
        try {
            Jwts.parser()
                    .verifyWith(key)
                    .requireIssuer(ISSUER)
                    .requireAudience(AUDIENCE)
                    .build()
                    .parseSignedClaims(token);
            return true;
        } catch (ExpiredJwtException e) {
            log.warn("[AUTH] operation=validateToken result=rejected reason=expired");
            return false;
        } catch (JwtException e) {
            log.warn("[AUTH] operation=validateToken result=rejected reason={}", e.getClass().getSimpleName());
            return false;
        } catch (IllegalArgumentException e) {
            log.warn("[AUTH] operation=validateToken result=rejected reason=malformed");
            return false;
        }
    }

    private void validateSecretConfiguration() {
        if (jwtSecret == null || jwtSecret.isBlank()) {
            throw new IllegalStateException("JWT secret must not be empty");
        }

        if (jwtSecret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException("JWT secret must be at least 32 bytes");
        }

        // Always prevent default secret in production
        if (environment.acceptsProfiles(Profiles.of("prod", "production"))
                && INSECURE_DEFAULT_SECRET.equals(jwtSecret)) {
            throw new IllegalStateException("JWT_SECRET must be configured in production. Do not use the default insecure secret.");
        }

        // Warn in non-production but still allow (developer convenience)
        if (enforceProdSecret && INSECURE_DEFAULT_SECRET.equals(jwtSecret)) {
            System.err.println("WARNING: Using default insecure JWT secret. This is only acceptable in development. Set JWT_SECRET environment variable for any non-development deployment.");
        }
    }
}
