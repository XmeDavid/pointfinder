package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.EmailChangeToken;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserRole;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.*;
import com.prayer.pointfinder.security.JwtTokenProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ConfirmEmailChangeTest {

    @Mock private UserRepository userRepository;
    @Mock private RefreshTokenRepository refreshTokenRepository;
    @Mock private PasswordResetTokenRepository passwordResetTokenRepository;
    @Mock private OperatorInviteRepository inviteRepository;
    @Mock private EmailChangeTokenRepository emailChangeTokenRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private JwtTokenProvider tokenProvider;
    @Mock private EmailService emailService;
    @Mock private LoginAttemptService loginAttemptService;

    @InjectMocks private AuthService authService;

    @Test
    void confirmEmailChange_success() {
        User user = User.builder()
                .id(UUID.randomUUID())
                .email("old@example.com")
                .name("Test")
                .role(UserRole.operator)
                .build();

        EmailChangeToken token = EmailChangeToken.builder()
                .id(UUID.randomUUID())
                .user(user)
                .newEmail("new@example.com")
                .token("valid-token")
                .expiresAt(Instant.now().plusSeconds(3600))
                .used(false)
                .build();

        when(emailChangeTokenRepository.findByToken("valid-token")).thenReturn(Optional.of(token));
        when(userRepository.existsByEmail("new@example.com")).thenReturn(false);

        authService.confirmEmailChange("valid-token");

        assertThat(user.getEmail()).isEqualTo("new@example.com");
        verify(userRepository).save(user);
        assertThat(token.isUsed()).isTrue();
        verify(emailChangeTokenRepository).save(token);
        verify(emailChangeTokenRepository).invalidateAllForUser(user.getId());
    }

    @Test
    void confirmEmailChange_invalidToken() {
        when(emailChangeTokenRepository.findByToken("bad-token")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.confirmEmailChange("bad-token"))
                .isInstanceOf(BadRequestException.class)
                .satisfies(ex -> assertThat(((BadRequestException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.EMAIL_CHANGE_TOKEN_INVALID));
    }

    @Test
    void confirmEmailChange_expiredToken() {
        EmailChangeToken token = EmailChangeToken.builder()
                .id(UUID.randomUUID())
                .user(User.builder().id(UUID.randomUUID()).build())
                .newEmail("new@example.com")
                .token("expired-token")
                .expiresAt(Instant.now().minusSeconds(3600))
                .used(false)
                .build();

        when(emailChangeTokenRepository.findByToken("expired-token")).thenReturn(Optional.of(token));

        assertThatThrownBy(() -> authService.confirmEmailChange("expired-token"))
                .isInstanceOf(BadRequestException.class)
                .satisfies(ex -> assertThat(((BadRequestException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.EMAIL_CHANGE_TOKEN_EXPIRED));
    }

    @Test
    void confirmEmailChange_emailNowTaken() {
        User user = User.builder().id(UUID.randomUUID()).email("old@example.com").build();
        EmailChangeToken token = EmailChangeToken.builder()
                .id(UUID.randomUUID())
                .user(user)
                .newEmail("taken@example.com")
                .token("valid-token")
                .expiresAt(Instant.now().plusSeconds(3600))
                .used(false)
                .build();

        when(emailChangeTokenRepository.findByToken("valid-token")).thenReturn(Optional.of(token));
        when(userRepository.existsByEmail("taken@example.com")).thenReturn(true);

        assertThatThrownBy(() -> authService.confirmEmailChange("valid-token"))
                .isInstanceOf(BadRequestException.class)
                .satisfies(ex -> assertThat(((BadRequestException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.EMAIL_ALREADY_TAKEN));
    }

    @Test
    void confirmEmailChange_usedToken() {
        EmailChangeToken token = EmailChangeToken.builder()
                .id(UUID.randomUUID())
                .user(User.builder().id(UUID.randomUUID()).build())
                .newEmail("new@example.com")
                .token("used-token")
                .expiresAt(Instant.now().plusSeconds(3600))
                .used(true)
                .build();

        when(emailChangeTokenRepository.findByToken("used-token")).thenReturn(Optional.of(token));

        assertThatThrownBy(() -> authService.confirmEmailChange("used-token"))
                .isInstanceOf(BadRequestException.class)
                .satisfies(ex -> assertThat(((BadRequestException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.EMAIL_CHANGE_TOKEN_INVALID));
    }
}
