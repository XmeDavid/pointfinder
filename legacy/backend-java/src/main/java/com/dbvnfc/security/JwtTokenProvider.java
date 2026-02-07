package com.dbvnfc.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Component
public class JwtTokenProvider {

    private final SecretKey key;
    private final long adminExpiration;
    private final long adminRefreshExpiration;
    private final long operatorExpiration;
    private final long operatorRefreshExpiration;
    private final long teamExpiration;

    public JwtTokenProvider(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.admin.expiration}") long adminExpiration,
            @Value("${app.jwt.admin.refresh-expiration}") long adminRefreshExpiration,
            @Value("${app.jwt.operator.expiration}") long operatorExpiration,
            @Value("${app.jwt.operator.refresh-expiration}") long operatorRefreshExpiration,
            @Value("${app.jwt.team.expiration}") long teamExpiration) {

        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.adminExpiration = adminExpiration;
        this.adminRefreshExpiration = adminRefreshExpiration;
        this.operatorExpiration = operatorExpiration;
        this.operatorRefreshExpiration = operatorRefreshExpiration;
        this.teamExpiration = teamExpiration;
    }

    // Admin tokens
    public String generateAdminToken(String adminId) {
        return Jwts.builder()
                .subject(adminId)
                .claim("role", "admin")
                .claim("type", "access")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + adminExpiration))
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    public String generateAdminRefreshToken(String adminId) {
        return Jwts.builder()
                .subject(adminId)
                .claim("role", "admin")
                .claim("type", "refresh")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + adminRefreshExpiration))
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    // Operator tokens
    public String generateOperatorToken(String operatorId) {
        return Jwts.builder()
                .subject(operatorId)
                .claim("role", "operator")
                .claim("type", "access")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + operatorExpiration))
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    public String generateOperatorRefreshToken(String operatorId) {
        return Jwts.builder()
                .subject(operatorId)
                .claim("role", "operator")
                .claim("type", "refresh")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + operatorRefreshExpiration))
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    // Team tokens
    public String generateTeamToken(String teamId, String deviceId) {
        return Jwts.builder()
                .subject(teamId)
                .claim("role", "team")
                .claim("device_id", deviceId)
                .claim("type", "access")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + teamExpiration))
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    // Token validation
    public Claims validateToken(String token) {
        try {
            return Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
        } catch (Exception e) {
            throw new RuntimeException("Invalid or expired token");
        }
    }

    public String getSubject(String token) {
        return validateToken(token).getSubject();
    }

    public String getRole(String token) {
        return (String) validateToken(token).get("role");
    }

    public String getDeviceId(String token) {
        return (String) validateToken(token).get("device_id");
    }

    public String getType(String token) {
        return (String) validateToken(token).get("type");
    }
}
