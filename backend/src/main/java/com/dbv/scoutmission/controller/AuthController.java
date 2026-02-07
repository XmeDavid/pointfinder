package com.dbv.scoutmission.controller;

import com.dbv.scoutmission.dto.request.LoginRequest;
import com.dbv.scoutmission.dto.request.RefreshTokenRequest;
import com.dbv.scoutmission.dto.request.RegisterRequest;
import com.dbv.scoutmission.dto.response.AuthResponse;
import com.dbv.scoutmission.entity.OperatorInvite;
import com.dbv.scoutmission.exception.BadRequestException;
import com.dbv.scoutmission.exception.ResourceNotFoundException;
import com.dbv.scoutmission.entity.InviteStatus;
import com.dbv.scoutmission.repository.OperatorInviteRepository;
import com.dbv.scoutmission.service.AuthService;
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
}
