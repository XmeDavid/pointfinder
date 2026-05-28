package com.prayer.pointfinder.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
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

    /**
     * Explicit developer opt-in to allow the known insecure default JWT
     * secret. Defaults to {@code false} so a deployment that forgets to set
     * {@code JWT_SECRET} fails hard on startup REGARDLESS of the active
     * Spring profile, instead of silently signing tokens with a public key.
     * Set {@code APP_JWT_ALLOW_INSECURE=true} (or
     * {@code app.jwt.allow-insecure=true}) for local development only.
     */
    @Value("${app.jwt.allow-insecure:false}")
    private boolean allowInsecureSecret;

    private SecretKey key;

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

        // Reject the known insecure default secret on EVERY profile unless a
        // developer has explicitly opted in. Keying the hard-fail off the
        // profile name (prod/production) is unsafe: a real prod deploy that
        // forgets to set the prod profile would silently run with a public
        // signing key. Failing hard by default closes that gap while keeping
        // dev ergonomics behind app.jwt.allow-insecure.
        if (INSECURE_DEFAULT_SECRET.equals(jwtSecret)) {
            if (!allowInsecureSecret) {
                throw new IllegalStateException(
                        "JWT_SECRET is unset or equal to the known insecure default. "
                                + "Set JWT_SECRET to a strong secret. For local development only, "
                                + "set app.jwt.allow-insecure=true (APP_JWT_ALLOW_INSECURE=true).");
            }
            log.warn("[AUTH] Using the insecure default JWT secret because app.jwt.allow-insecure=true. "
                    + "This MUST NOT be enabled in any deployed environment.");
        }
    }
}
