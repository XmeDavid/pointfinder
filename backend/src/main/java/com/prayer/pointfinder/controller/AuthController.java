package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.*;
import com.prayer.pointfinder.dto.response.AuthResponse;
import com.prayer.pointfinder.dto.response.InviteTokenResponse;
import com.prayer.pointfinder.dto.response.MessageResponse;
import com.prayer.pointfinder.dto.response.PlayerAuthResponse;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.RateLimitExceededException;
import com.prayer.pointfinder.service.AuthService;
import com.prayer.pointfinder.service.InviteService;
import com.prayer.pointfinder.service.PlayerJoinRateLimiter;
import com.prayer.pointfinder.service.PlayerService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@Slf4j
public class AuthController {

    private final AuthService authService;
    private final InviteService inviteService;
    private final PlayerService playerService;
    private final PlayerJoinRateLimiter playerJoinRateLimiter;

    @Value("${app.frontend-url:https://pointfinder.pt}")
    private String frontendUrl;

    @Value("${app.jwt.refresh-token-expiration-ms}")
    private long refreshTokenExpirationMs;

    private static final String REFRESH_TOKEN_COOKIE = "pf_refresh";

    // ---- Refresh-token cookie helpers (audit 12.1) ----

    private ResponseCookie buildRefreshTokenCookie(String token) {
        long maxAgeSeconds = refreshTokenExpirationMs / 1000;
        boolean secure = frontendUrl.startsWith("https://");
        return ResponseCookie.from(REFRESH_TOKEN_COOKIE, token)
                .httpOnly(true)
                .secure(secure)
                .sameSite("Strict")
                .path("/api/auth")
                .maxAge(maxAgeSeconds)
                .build();
    }

    private ResponseCookie clearRefreshTokenCookie() {
        boolean secure = frontendUrl.startsWith("https://");
        return ResponseCookie.from(REFRESH_TOKEN_COOKIE, "")
                .httpOnly(true)
                .secure(secure)
                .sameSite("Strict")
                .path("/api/auth")
                .maxAge(0)
                .build();
    }

    /**
     * Resolve the refresh token from either the request body (mobile clients)
     * or the HttpOnly cookie (web clients). Body takes precedence so mobile
     * apps that do not use cookies keep working.
     */
    private String resolveRefreshToken(RefreshTokenRequest request, String cookieToken) {
        if (request != null && request.getRefreshToken() != null && !request.getRefreshToken().isBlank()) {
            return request.getRefreshToken();
        }
        if (cookieToken != null && !cookieToken.isBlank()) {
            return cookieToken;
        }
        return null;
    }

    @PostMapping("/player/join")
    public ResponseEntity<PlayerAuthResponse> joinTeam(
            @Valid @RequestBody PlayerJoinRequest request,
            HttpServletRequest httpRequest) {
        String ip = resolveClientIp(httpRequest);
        if (!playerJoinRateLimiter.tryAcquire(ip, request.getDeviceId())) {
            log.warn("[AUTH] operation=playerJoin result=rateLimited ip={} deviceId={}",
                    ip, request.getDeviceId());
            throw new RateLimitExceededException("Too many join attempts. Please try again shortly.");
        }
        return ResponseEntity.ok(playerService.joinTeam(request));
    }

    private String resolveClientIp(HttpServletRequest request) {
        // Prefer X-Forwarded-For (first hop) from the reverse proxy; fall back
        // to the direct remote addr when the app is hit without nginx in
        // front of it (dev, tests).
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            int comma = forwarded.indexOf(',');
            return comma > 0 ? forwarded.substring(0, comma).trim() : forwarded.trim();
        }
        return request.getRemoteAddr();
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        AuthResponse response = authService.login(request);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, buildRefreshTokenCookie(response.refreshToken()).toString())
                .body(response);
    }

    @GetMapping("/invite/{token}")
    public ResponseEntity<InviteTokenResponse> getInviteByToken(@PathVariable String token) {
        return ResponseEntity.ok(inviteService.getInviteByToken(token));
    }

    @PostMapping("/register/{token}")
    public ResponseEntity<AuthResponse> register(@PathVariable String token,
                                                  @Valid @RequestBody RegisterRequest request) {
        AuthResponse response = authService.register(token, request);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, buildRefreshTokenCookie(response.refreshToken()).toString())
                .body(response);
    }

    @PostMapping("/request-registration")
    public ResponseEntity<MessageResponse> requestRegistration(
            @Valid @RequestBody RequestRegistrationRequest request,
            @RequestHeader(value = "X-Forwarded-Host", required = false) String forwardedHost) {
        // Audit 12.7: Only use X-Forwarded-Host (set by reverse proxy). Do not fall back
        // to the raw Host header — it is user-controlled and spoofable. If X-Forwarded-Host
        // is absent, pass null; EmailService.resolveFrontendBaseUrl falls back to the
        // configured app.frontend-url.
        authService.requestRegistration(request.getEmail().trim(), forwardedHost);
        return ResponseEntity.ok(new MessageResponse("If eligible, a registration link has been sent."));
    }

    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(
            @RequestBody(required = false) RefreshTokenRequest request,
            @CookieValue(name = REFRESH_TOKEN_COOKIE, required = false) String cookieRefreshToken) {
        String refreshToken = resolveRefreshToken(request, cookieRefreshToken);
        if (refreshToken == null) {
            throw new BadRequestException("No refresh token provided");
        }
        AuthResponse response = authService.refreshToken(refreshToken);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, buildRefreshTokenCookie(response.refreshToken()).toString())
                .body(response);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            @RequestBody(required = false) RefreshTokenRequest request,
            @CookieValue(name = REFRESH_TOKEN_COOKIE, required = false) String cookieRefreshToken) {
        String refreshToken = resolveRefreshToken(request, cookieRefreshToken);
        if (refreshToken != null) {
            authService.logout(refreshToken);
        }
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, clearRefreshTokenCookie().toString())
                .build();
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<MessageResponse> forgotPassword(
            @Valid @RequestBody ForgotPasswordRequest request,
            @RequestHeader(value = "X-Forwarded-Host", required = false) String forwardedHost) {
        // Audit 12.7: Only use X-Forwarded-Host. See /request-registration comment.
        authService.requestPasswordReset(request.getEmail(), forwardedHost);
        return ResponseEntity.ok(new MessageResponse("If an account with that email exists, a reset link has been sent."));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<MessageResponse> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        authService.resetPassword(request.getToken(), request.getPassword());
        return ResponseEntity.ok(new MessageResponse("Password has been reset successfully."));
    }

    @PostMapping("/change-password")
    public ResponseEntity<MessageResponse> changePassword(
            @Valid @RequestBody ChangePasswordRequest request,
            @CookieValue(name = REFRESH_TOKEN_COOKIE, required = false) String cookieRefreshToken) {
        // Resolve refresh token: body field takes precedence, then cookie
        if ((request.getRefreshToken() == null || request.getRefreshToken().isBlank())
                && cookieRefreshToken != null && !cookieRefreshToken.isBlank()) {
            request.setRefreshToken(cookieRefreshToken);
        }
        authService.changePassword(request);
        return ResponseEntity.ok(new MessageResponse("Password changed successfully."));
    }

    @GetMapping("/confirm-email")
    public ResponseEntity<Void> confirmEmailChange(@RequestParam String token) {
        authService.confirmEmailChange(token);
        return ResponseEntity.status(302)
                .header("Location", frontendUrl + "/profile?tab=general&emailConfirmed=true")
                .build();
    }
}
