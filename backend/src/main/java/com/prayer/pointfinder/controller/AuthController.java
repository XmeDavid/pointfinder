package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.*;
import com.prayer.pointfinder.dto.response.AuthResponse;
import com.prayer.pointfinder.dto.response.InviteTokenResponse;
import com.prayer.pointfinder.dto.response.MessageResponse;
import com.prayer.pointfinder.dto.response.PlayerAuthResponse;
import com.prayer.pointfinder.service.AuthService;
import com.prayer.pointfinder.service.InviteService;
import com.prayer.pointfinder.service.PlayerService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final InviteService inviteService;
    private final PlayerService playerService;

    @PostMapping("/player/join")
    public ResponseEntity<PlayerAuthResponse> joinTeam(@Valid @RequestBody PlayerJoinRequest request) {
        return ResponseEntity.ok(playerService.joinTeam(request));
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
            @RequestHeader(value = "X-Forwarded-Host", required = false) String forwardedHost) {
        authService.requestPasswordReset(request.getEmail(), forwardedHost);
        return ResponseEntity.ok(new MessageResponse("If an account with that email exists, a reset link has been sent."));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<MessageResponse> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        authService.resetPassword(request.getToken(), request.getPassword());
        return ResponseEntity.ok(new MessageResponse("Password has been reset successfully."));
    }
}
