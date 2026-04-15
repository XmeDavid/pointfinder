package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.UpdateProfileRequest;
import com.prayer.pointfinder.dto.response.UpdateProfileResponse;
import com.prayer.pointfinder.entity.EmailChangeToken;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserRole;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.EmailChangeTokenRepository;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.RefreshTokenRepository;
import com.prayer.pointfinder.repository.UserRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UpdateProfileTest {

    @Mock private UserRepository userRepository;
    @Mock private RefreshTokenRepository refreshTokenRepository;
    @Mock private GameRepository gameRepository;
    @Mock private EmailChangeTokenRepository emailChangeTokenRepository;
    @Mock private EmailService emailService;

    @InjectMocks private UserService userService;

    private User testUser;

    @BeforeEach
    void setUp() {
        testUser = User.builder()
                .id(UUID.randomUUID())
                .email("old@example.com")
                .name("Old Name")
                .role(UserRole.operator)
                .build();
    }

    @Test
    void updateProfile_nameOnly_updatesNameAndSaves() {
        try (MockedStatic<SecurityUtils> mocked = mockStatic(SecurityUtils.class)) {
            mocked.when(SecurityUtils::getCurrentUser).thenReturn(testUser);

            UpdateProfileRequest request = new UpdateProfileRequest();
            request.setName("New Name");

            UpdateProfileResponse response = userService.updateProfile(request, "pointfinder.pt");

            assertThat(testUser.getName()).isEqualTo("New Name");
            verify(userRepository).save(testUser);
            assertThat(response.getUser().getName()).isEqualTo("New Name");
            assertThat(response.getMessage()).isNull();
            verifyNoInteractions(emailChangeTokenRepository, emailService);
        }
    }

    @Test
    void updateProfile_emailChange_createsTokenAndSendsEmail() {
        try (MockedStatic<SecurityUtils> mocked = mockStatic(SecurityUtils.class)) {
            mocked.when(SecurityUtils::getCurrentUser).thenReturn(testUser);
            when(userRepository.existsByEmail("new@example.com")).thenReturn(false);

            UpdateProfileRequest request = new UpdateProfileRequest();
            request.setEmail("new@example.com");

            UpdateProfileResponse response = userService.updateProfile(request, "pointfinder.pt");

            verify(emailChangeTokenRepository).invalidateAllForUser(testUser.getId());

            ArgumentCaptor<EmailChangeToken> tokenCaptor = ArgumentCaptor.forClass(EmailChangeToken.class);
            verify(emailChangeTokenRepository).save(tokenCaptor.capture());
            EmailChangeToken savedToken = tokenCaptor.getValue();
            assertThat(savedToken.getNewEmail()).isEqualTo("new@example.com");
            assertThat(savedToken.getToken()).isNotBlank();
            assertThat(savedToken.getUser()).isEqualTo(testUser);

            verify(emailService).sendEmailChangeConfirmation(
                    eq("new@example.com"),
                    eq(savedToken.getToken()),
                    eq("pointfinder.pt")
            );

            assertThat(response.getMessage()).isEqualTo("A verification email has been sent to the new address.");
            verify(userRepository).save(testUser);
        }
    }

    @Test
    void updateProfile_emailAlreadyTaken_throwsBadRequestWithErrorCode() {
        try (MockedStatic<SecurityUtils> mocked = mockStatic(SecurityUtils.class)) {
            mocked.when(SecurityUtils::getCurrentUser).thenReturn(testUser);
            when(userRepository.existsByEmail("taken@example.com")).thenReturn(true);

            UpdateProfileRequest request = new UpdateProfileRequest();
            request.setEmail("taken@example.com");

            assertThatThrownBy(() -> userService.updateProfile(request, "pointfinder.pt"))
                    .isInstanceOf(BadRequestException.class)
                    .satisfies(ex -> assertThat(((BadRequestException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.EMAIL_ALREADY_TAKEN));

            verifyNoInteractions(emailService);
            verify(emailChangeTokenRepository, never()).save(any());
        }
    }
}
