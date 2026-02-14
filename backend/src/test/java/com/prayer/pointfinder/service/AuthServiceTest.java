package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.LoginRequest;
import com.prayer.pointfinder.dto.request.RegisterRequest;
import com.prayer.pointfinder.dto.response.AuthResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.repository.OperatorInviteRepository;
import com.prayer.pointfinder.repository.RefreshTokenRepository;
import com.prayer.pointfinder.repository.UserRepository;
import com.prayer.pointfinder.security.JwtTokenProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private RefreshTokenRepository refreshTokenRepository;
    @Mock private OperatorInviteRepository inviteRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private JwtTokenProvider tokenProvider;

    @InjectMocks private AuthService authService;

    @Test
    void loginSucceedsWithValidCredentials() {
        User user = User.builder()
                .id(UUID.randomUUID())
                .email("op@test.com")
                .name("Operator")
                .passwordHash("hashed")
                .role(UserRole.operator)
                .build();

        when(userRepository.findByEmail("op@test.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("secret", "hashed")).thenReturn(true);
        when(tokenProvider.generateAccessToken(any(), anyString(), anyString())).thenReturn("access-jwt");
        when(tokenProvider.generateRefreshTokenString()).thenReturn("refresh-uuid");
        when(tokenProvider.getRefreshTokenExpirationMs()).thenReturn(604800000L);
        when(refreshTokenRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        LoginRequest request = new LoginRequest();
        request.setEmail("op@test.com");
        request.setPassword("secret");

        AuthResponse response = authService.login(request);

        assertNotNull(response.getAccessToken());
        assertNotNull(response.getRefreshToken());
        assertEquals("op@test.com", response.getUser().getEmail());
    }

    @Test
    void loginFailsWithWrongPassword() {
        User user = User.builder()
                .id(UUID.randomUUID())
                .email("op@test.com")
                .name("Operator")
                .passwordHash("hashed")
                .role(UserRole.operator)
                .build();

        when(userRepository.findByEmail("op@test.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("wrong", "hashed")).thenReturn(false);

        LoginRequest request = new LoginRequest();
        request.setEmail("op@test.com");
        request.setPassword("wrong");

        assertThrows(BadCredentialsException.class, () -> authService.login(request));
    }

    @Test
    void loginFailsWithNonexistentEmail() {
        when(userRepository.findByEmail("nobody@test.com")).thenReturn(Optional.empty());

        LoginRequest request = new LoginRequest();
        request.setEmail("nobody@test.com");
        request.setPassword("any");

        assertThrows(BadCredentialsException.class, () -> authService.login(request));
    }

    @Test
    void registerRejectsAlreadyUsedInvite() {
        OperatorInvite invite = OperatorInvite.builder()
                .id(UUID.randomUUID())
                .token("tok123")
                .email("new@test.com")
                .status(InviteStatus.accepted)
                .build();

        when(inviteRepository.findByToken("tok123")).thenReturn(Optional.of(invite));

        RegisterRequest request = new RegisterRequest();
        request.setEmail("new@test.com");
        request.setName("New");
        request.setPassword("password123");

        assertThrows(BadRequestException.class, () -> authService.register("tok123", request));
        verify(userRepository, never()).save(any());
    }

    @Test
    void registerRejectsDuplicateEmail() {
        OperatorInvite invite = OperatorInvite.builder()
                .id(UUID.randomUUID())
                .token("tok123")
                .email("dup@test.com")
                .status(InviteStatus.pending)
                .build();

        when(inviteRepository.findByToken("tok123")).thenReturn(Optional.of(invite));
        when(userRepository.existsByEmail("dup@test.com")).thenReturn(true);

        RegisterRequest request = new RegisterRequest();
        request.setEmail("dup@test.com");
        request.setName("Dup");
        request.setPassword("password123");

        assertThrows(BadRequestException.class, () -> authService.register("tok123", request));
        verify(userRepository, never()).save(any());
    }

    @Test
    void refreshTokenRejectsExpiredToken() {
        RefreshToken expired = RefreshToken.builder()
                .id(UUID.randomUUID())
                .token("expired-token")
                .expiresAt(Instant.now().minusSeconds(3600))
                .user(User.builder().id(UUID.randomUUID()).build())
                .build();

        when(refreshTokenRepository.findByToken("expired-token")).thenReturn(Optional.of(expired));

        assertThrows(BadRequestException.class, () -> authService.refreshToken("expired-token"));
        verify(refreshTokenRepository).delete(expired);
    }
}

