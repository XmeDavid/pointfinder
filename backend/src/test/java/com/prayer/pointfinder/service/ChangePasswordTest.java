package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.ChangePasswordRequest;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserRole;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.*;
import com.prayer.pointfinder.security.JwtTokenProvider;
import com.prayer.pointfinder.security.SecurityUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ChangePasswordTest {

    @Mock private UserRepository userRepository;
    @Mock private RefreshTokenRepository refreshTokenRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private JwtTokenProvider tokenProvider;
    @Mock private PasswordResetTokenRepository passwordResetTokenRepository;
    @Mock private OperatorInviteRepository inviteRepository;
    @Mock private EmailService emailService;
    @Mock private LoginAttemptService loginAttemptService;

    @InjectMocks private AuthService authService;

    private User testUser;

    @BeforeEach
    void setUp() {
        testUser = User.builder()
                .id(UUID.randomUUID())
                .email("test@example.com")
                .name("Test User")
                .passwordHash("encoded-old-password")
                .role(UserRole.operator)
                .build();
    }

    @Test
    void changePassword_success() {
        try (MockedStatic<SecurityUtils> mocked = mockStatic(SecurityUtils.class)) {
            mocked.when(SecurityUtils::getCurrentUser).thenReturn(testUser);
            when(passwordEncoder.matches("oldPass1", "encoded-old-password")).thenReturn(true);
            when(passwordEncoder.encode("NewPass1")).thenReturn("encoded-new-password");

            ChangePasswordRequest request = new ChangePasswordRequest();
            request.setCurrentPassword("oldPass1");
            request.setNewPassword("NewPass1");
            request.setRefreshToken("keep-this-token");

            authService.changePassword(request);

            verify(userRepository).save(testUser);
            assertThat(testUser.getPasswordHash()).isEqualTo("encoded-new-password");
            verify(refreshTokenRepository).deleteByUserIdAndTokenNot(testUser.getId(), "keep-this-token");
        }
    }

    @Test
    void changePassword_wrongCurrentPassword() {
        try (MockedStatic<SecurityUtils> mocked = mockStatic(SecurityUtils.class)) {
            mocked.when(SecurityUtils::getCurrentUser).thenReturn(testUser);
            when(passwordEncoder.matches("wrongPass", "encoded-old-password")).thenReturn(false);

            ChangePasswordRequest request = new ChangePasswordRequest();
            request.setCurrentPassword("wrongPass");
            request.setNewPassword("NewPass1");
            request.setRefreshToken("token");

            assertThatThrownBy(() -> authService.changePassword(request))
                    .isInstanceOf(BadRequestException.class)
                    .satisfies(ex -> assertThat(((BadRequestException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.INVALID_CURRENT_PASSWORD));
        }
    }

    @Test
    void changePassword_weakNewPassword() {
        try (MockedStatic<SecurityUtils> mocked = mockStatic(SecurityUtils.class)) {
            mocked.when(SecurityUtils::getCurrentUser).thenReturn(testUser);
            when(passwordEncoder.matches("oldPass1", "encoded-old-password")).thenReturn(true);

            ChangePasswordRequest request = new ChangePasswordRequest();
            request.setCurrentPassword("oldPass1");
            request.setNewPassword("weak");
            request.setRefreshToken("token");

            assertThatThrownBy(() -> authService.changePassword(request))
                    .isInstanceOf(BadRequestException.class);
        }
    }
}
