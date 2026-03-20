package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.LoginRequest;
import com.prayer.pointfinder.dto.request.RegisterRequest;
import com.prayer.pointfinder.dto.response.AuthResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.repository.OperatorInviteRepository;
import com.prayer.pointfinder.repository.PasswordResetTokenRepository;
import com.prayer.pointfinder.repository.RefreshTokenRepository;
import com.prayer.pointfinder.repository.UserRepository;
import com.prayer.pointfinder.security.JwtTokenProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private RefreshTokenRepository refreshTokenRepository;
    @Mock private PasswordResetTokenRepository passwordResetTokenRepository;
    @Mock private OperatorInviteRepository inviteRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private JwtTokenProvider tokenProvider;
    @Mock private EmailService emailService;
    @Mock private LoginAttemptService loginAttemptService;

    @InjectMocks private AuthService authService;

    private User testUser;

    @BeforeEach
    void setUp() {
        testUser = User.builder()
                .id(UUID.randomUUID())
                .email("operator@example.com")
                .name("Operator")
                .passwordHash("encoded-hash")
                .role(UserRole.operator)
                .createdAt(Instant.now())
                .build();
    }

    // --- Helper methods ---

    private void stubTokenGeneration() {
        when(tokenProvider.generateAccessToken(any(), anyString(), anyString())).thenReturn("access-token");
        when(tokenProvider.generateRefreshTokenString()).thenReturn("refresh-token");
        when(tokenProvider.getRefreshTokenExpirationMs()).thenReturn(604800000L);
        when(refreshTokenRepository.save(any(RefreshToken.class))).thenAnswer(inv -> inv.getArgument(0));
        when(refreshTokenRepository.countByUserId(any())).thenReturn(1L);
    }

    @Nested
    class Login {

        @Test
        void successfulLogin() {
            when(loginAttemptService.isBlocked("operator@example.com")).thenReturn(false);
            when(userRepository.findByEmail("operator@example.com")).thenReturn(Optional.of(testUser));
            when(passwordEncoder.matches("Password1", testUser.getPasswordHash())).thenReturn(true);
            stubTokenGeneration();

            LoginRequest request = new LoginRequest();
            request.setEmail("operator@example.com");
            request.setPassword("Password1");

            AuthResponse response = authService.login(request);

            assertNotNull(response);
            verify(loginAttemptService).recordSuccess("operator@example.com");
        }

        @Test
        void loginBlockedAfterTooManyAttempts() {
            when(loginAttemptService.isBlocked("operator@example.com")).thenReturn(true);

            LoginRequest request = new LoginRequest();
            request.setEmail("operator@example.com");
            request.setPassword("Password1");

            BadRequestException ex = assertThrows(BadRequestException.class, () -> authService.login(request));
            assertTrue(ex.getMessage().contains("Too many login attempts"));
            verify(userRepository, never()).findByEmail(any());
        }

        @Test
        void loginRecordsFailureOnBadCredentials() {
            when(loginAttemptService.isBlocked("operator@example.com")).thenReturn(false);
            when(userRepository.findByEmail("operator@example.com")).thenReturn(Optional.of(testUser));
            when(passwordEncoder.matches("wrong", testUser.getPasswordHash())).thenReturn(false);

            LoginRequest request = new LoginRequest();
            request.setEmail("operator@example.com");
            request.setPassword("wrong");

            assertThrows(BadCredentialsException.class, () -> authService.login(request));
            verify(loginAttemptService).recordFailure("operator@example.com");
        }

        @Test
        void loginRecordsFailureOnUserNotFound() {
            when(loginAttemptService.isBlocked("unknown@example.com")).thenReturn(false);
            when(userRepository.findByEmail("unknown@example.com")).thenReturn(Optional.empty());

            LoginRequest request = new LoginRequest();
            request.setEmail("unknown@example.com");
            request.setPassword("Password1");

            assertThrows(BadCredentialsException.class, () -> authService.login(request));
            verify(loginAttemptService).recordFailure("unknown@example.com");
        }
    }

    @Nested
    class Register {

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
            request.setPassword("Password1");

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
            request.setPassword("Password1");

            assertThrows(BadRequestException.class, () -> authService.register("tok123", request));
            verify(userRepository, never()).save(any());
        }

        @Test
        void registerRejectsEmailMismatch() {
            OperatorInvite invite = OperatorInvite.builder()
                    .id(UUID.randomUUID())
                    .email("invited@example.com")
                    .token("invite-token")
                    .status(InviteStatus.pending)
                    .invitedBy(testUser)
                    .build();

            when(inviteRepository.findByToken("invite-token")).thenReturn(Optional.of(invite));

            RegisterRequest request = new RegisterRequest();
            request.setName("New User");
            request.setEmail("different@example.com");
            request.setPassword("Password1");

            BadRequestException ex = assertThrows(BadRequestException.class,
                    () -> authService.register("invite-token", request));
            assertEquals("Email does not match the invitation", ex.getMessage());
        }

        @Test
        void registerAcceptsCaseInsensitiveEmailMatch() {
            OperatorInvite invite = OperatorInvite.builder()
                    .id(UUID.randomUUID())
                    .email("Invited@Example.com")
                    .token("invite-token")
                    .status(InviteStatus.pending)
                    .invitedBy(testUser)
                    .build();

            when(inviteRepository.findByToken("invite-token")).thenReturn(Optional.of(invite));
            when(userRepository.existsByEmail("invited@example.com")).thenReturn(false);
            when(passwordEncoder.encode(anyString())).thenReturn("encoded");
            when(userRepository.save(any(User.class))).thenAnswer(inv -> {
                User u = inv.getArgument(0);
                u.setId(UUID.randomUUID());
                u.setCreatedAt(Instant.now());
                return u;
            });
            when(inviteRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            stubTokenGeneration();

            RegisterRequest request = new RegisterRequest();
            request.setName("New User");
            request.setEmail("invited@example.com");
            request.setPassword("Password1");

            AuthResponse response = authService.register("invite-token", request);
            assertNotNull(response);
        }
    }

    @Nested
    class PasswordValidation {

        @Test
        void rejectsShortPassword() {
            BadRequestException ex = assertThrows(BadRequestException.class,
                    () -> authService.validatePassword("Short1"));
            assertTrue(ex.getMessage().contains("at least 8 characters"));
        }

        @Test
        void rejectsTooLongPassword() {
            String longPassword = "A1" + "a".repeat(127);
            BadRequestException ex = assertThrows(BadRequestException.class,
                    () -> authService.validatePassword(longPassword));
            assertTrue(ex.getMessage().contains("128 characters"));
        }

        @Test
        void rejectsPasswordWithoutUppercase() {
            BadRequestException ex = assertThrows(BadRequestException.class,
                    () -> authService.validatePassword("password1"));
            assertTrue(ex.getMessage().contains("uppercase"));
        }

        @Test
        void rejectsPasswordWithoutDigit() {
            BadRequestException ex = assertThrows(BadRequestException.class,
                    () -> authService.validatePassword("Password"));
            assertTrue(ex.getMessage().contains("digit"));
        }

        @Test
        void acceptsValidPassword() {
            // Should not throw
            authService.validatePassword("Password1");
        }

        @Test
        void acceptsMinLengthPassword() {
            authService.validatePassword("Passwor1");
        }

        @Test
        void acceptsMaxLengthPassword() {
            String password = "A1" + "a".repeat(126);
            authService.validatePassword(password);
        }
    }

    @Nested
    class RefreshTokenLimits {

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

        @Test
        void refreshTokenRejectsExpiredSession() {
            RefreshToken storedToken = RefreshToken.builder()
                    .id(UUID.randomUUID())
                    .user(testUser)
                    .token("old-token")
                    .expiresAt(Instant.now().plus(7, ChronoUnit.DAYS))
                    .createdAt(Instant.now().minus(31, ChronoUnit.DAYS)) // older than 30 days
                    .build();

            when(refreshTokenRepository.findByToken("old-token")).thenReturn(Optional.of(storedToken));

            BadRequestException ex = assertThrows(BadRequestException.class,
                    () -> authService.refreshToken("old-token"));
            assertTrue(ex.getMessage().contains("Session expired"));
            verify(refreshTokenRepository).delete(storedToken);
        }

        @Test
        void refreshTokenAcceptsRecentSession() {
            RefreshToken storedToken = RefreshToken.builder()
                    .id(UUID.randomUUID())
                    .user(testUser)
                    .token("recent-token")
                    .expiresAt(Instant.now().plus(7, ChronoUnit.DAYS))
                    .createdAt(Instant.now().minus(5, ChronoUnit.DAYS)) // within 30 days
                    .build();

            when(refreshTokenRepository.findByToken("recent-token")).thenReturn(Optional.of(storedToken));
            stubTokenGeneration();

            AuthResponse response = authService.refreshToken("recent-token");
            assertNotNull(response);
        }

        @Test
        void enforcesMaxConcurrentTokens() {
            // Setup: user already has 5 tokens, refreshing creates a 6th
            RefreshToken storedToken = RefreshToken.builder()
                    .id(UUID.randomUUID())
                    .user(testUser)
                    .token("current-token")
                    .expiresAt(Instant.now().plus(7, ChronoUnit.DAYS))
                    .createdAt(Instant.now().minus(1, ChronoUnit.DAYS))
                    .build();

            when(refreshTokenRepository.findByToken("current-token")).thenReturn(Optional.of(storedToken));
            when(tokenProvider.generateAccessToken(any(), anyString(), anyString())).thenReturn("access");
            when(tokenProvider.generateRefreshTokenString()).thenReturn("new-refresh");
            when(tokenProvider.getRefreshTokenExpirationMs()).thenReturn(604800000L);
            when(refreshTokenRepository.save(any(RefreshToken.class))).thenAnswer(inv -> inv.getArgument(0));

            // After saving the new token, count returns 6 (exceeds limit of 5)
            when(refreshTokenRepository.countByUserId(testUser.getId())).thenReturn(6L);

            // Return list of tokens ordered by createdAt ASC (oldest first)
            List<RefreshToken> existingTokens = new ArrayList<>();
            for (int i = 0; i < 6; i++) {
                existingTokens.add(RefreshToken.builder()
                        .id(UUID.randomUUID())
                        .user(testUser)
                        .token("token-" + i)
                        .createdAt(Instant.now().minus(6 - i, ChronoUnit.DAYS))
                        .build());
            }
            when(refreshTokenRepository.findByUserIdOrderByCreatedAtAsc(testUser.getId()))
                    .thenReturn(existingTokens);

            AuthResponse response = authService.refreshToken("current-token");
            assertNotNull(response);

            // Oldest token should have been deleted
            verify(refreshTokenRepository).delete(existingTokens.get(0));
        }
    }
}
