package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.*;
import com.prayer.pointfinder.dto.response.AuthResponse;
import com.prayer.pointfinder.entity.OperatorInvite;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.entity.InviteStatus;
import com.prayer.pointfinder.repository.OperatorInviteRepository;
import com.prayer.pointfinder.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final OperatorInviteRepository inviteRepository;

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    @GetMapping("/invite/{token}")
    public ResponseEntity<Map<String, String>> getInviteByToken(@PathVariable String token) {
        OperatorInvite invite = inviteRepository.findByToken(token)
                .orElseThrow(() -> new ResourceNotFoundException("Invalid invite token"));
        if (invite.getStatus() != InviteStatus.pending) {
            throw new BadRequestException("Invite has already been used or expired");
        }
        return ResponseEntity.ok(Map.of("email", invite.getEmail()));
    }

    @PostMapping("/register/{token}")
    public ResponseEntity<AuthResponse> register(@PathVariable String token,
                                                  @Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.ok(authService.register(token, request));
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
    public ResponseEntity<Map<String, String>> forgotPassword(
            @Valid @RequestBody ForgotPasswordRequest request,
            @RequestHeader(value = "X-Forwarded-Host", required = false) String forwardedHost) {
        authService.requestPasswordReset(request.getEmail(), forwardedHost);
        return ResponseEntity.ok(Map.of("message", "If an account with that email exists, a reset link has been sent."));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<Map<String, String>> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        authService.resetPassword(request.getToken(), request.getPassword());
        return ResponseEntity.ok(Map.of("message", "Password has been reset successfully."));
    }
}
