package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.*;
import com.prayer.pointfinder.dto.response.AuthResponse;
import com.prayer.pointfinder.dto.response.InviteTokenResponse;
import com.prayer.pointfinder.dto.response.MessageResponse;
import com.prayer.pointfinder.dto.response.PlayerAuthResponse;
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
        return ResponseEntity.ok(authService.login(request));
    }

    @GetMapping("/invite/{token}")
    public ResponseEntity<InviteTokenResponse> getInviteByToken(@PathVariable String token) {
        return ResponseEntity.ok(inviteService.getInviteByToken(token));
    }

    @PostMapping("/register/{token}")
    public ResponseEntity<AuthResponse> register(@PathVariable String token,
                                                  @Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.ok(authService.register(token, request));
    }

    @PostMapping("/request-registration")
    public ResponseEntity<MessageResponse> requestRegistration(
            @Valid @RequestBody RequestRegistrationRequest request,
            @RequestHeader(value = "X-Forwarded-Host", required = false) String forwardedHost,
            HttpServletRequest httpRequest) {
        // Prefer X-Forwarded-Host (set by reverse proxy) over Host header for consistency
        // with other endpoints (e.g., forgot-password) and to avoid spoofing risks
        String requestHost = forwardedHost != null ? forwardedHost : httpRequest.getHeader("Host");
        authService.requestRegistration(request.getEmail().trim(), requestHost);
        return ResponseEntity.ok(new MessageResponse("If eligible, a registration link has been sent."));
    }

    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(@Valid @RequestBody RefreshTokenRequest request) {
        return ResponseEntity.ok(authService.refreshToken(request.getRefreshToken()));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@Valid @RequestBody RefreshTokenRequest request) {
        authService.logout(request.getRefreshToken());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<MessageResponse> forgotPassword(
            @Valid @RequestBody ForgotPasswordRequest request,
            @RequestHeader(value = "X-Forwarded-Host", required = false) String forwardedHost,
            HttpServletRequest httpRequest) {
        // Use X-Forwarded-Host with Host fallback, consistent with /request-registration
        String requestHost = forwardedHost != null ? forwardedHost : httpRequest.getHeader("Host");
        authService.requestPasswordReset(request.getEmail(), requestHost);
        return ResponseEntity.ok(new MessageResponse("If an account with that email exists, a reset link has been sent."));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<MessageResponse> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        authService.resetPassword(request.getToken(), request.getPassword());
        return ResponseEntity.ok(new MessageResponse("Password has been reset successfully."));
    }

    @PostMapping("/change-password")
    public ResponseEntity<MessageResponse> changePassword(@Valid @RequestBody ChangePasswordRequest request) {
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
