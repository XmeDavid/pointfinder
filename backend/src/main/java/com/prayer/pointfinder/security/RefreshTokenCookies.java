package com.prayer.pointfinder.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/**
 * Builds the HttpOnly {@code pf_refresh} cookie that carries a refresh token
 * for web clients (audit 12.1). Shared by every endpoint that mints a session
 * so the cookie attributes never drift between them; mobile clients ignore
 * the cookie and keep the token from the response body.
 */
@Component
public class RefreshTokenCookies {

    public static final String COOKIE_NAME = "pf_refresh";
    private static final String COOKIE_PATH = "/api/auth";

    private final String frontendUrl;
    private final long refreshTokenExpirationMs;

    public RefreshTokenCookies(@Value("${app.frontend-url:https://pointfinder.pt}") String frontendUrl,
                               @Value("${app.jwt.refresh-token-expiration-ms}") long refreshTokenExpirationMs) {
        this.frontendUrl = frontendUrl;
        this.refreshTokenExpirationMs = refreshTokenExpirationMs;
    }

    public ResponseCookie build(String token) {
        return ResponseCookie.from(COOKIE_NAME, token)
                .httpOnly(true)
                .secure(secure())
                .sameSite("Strict")
                .path(COOKIE_PATH)
                .maxAge(refreshTokenExpirationMs / 1000)
                .build();
    }

    public ResponseCookie clear() {
        return ResponseCookie.from(COOKIE_NAME, "")
                .httpOnly(true)
                .secure(secure())
                .sameSite("Strict")
                .path(COOKIE_PATH)
                .maxAge(0)
                .build();
    }

    private boolean secure() {
        return frontendUrl.startsWith("https://");
    }
}
