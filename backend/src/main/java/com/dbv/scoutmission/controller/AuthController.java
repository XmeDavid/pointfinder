package com.dbv.scoutmission.controller;

import com.dbv.scoutmission.dto.request.LoginRequest;
import com.dbv.scoutmission.dto.request.RefreshTokenRequest;
import com.dbv.scoutmission.dto.request.RegisterRequest;
import com.dbv.scoutmission.dto.response.AuthResponse;
import com.dbv.scoutmission.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
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
