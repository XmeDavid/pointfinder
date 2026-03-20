package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.LoginRequest;
import com.prayer.pointfinder.dto.request.RegisterRequest;
import com.prayer.pointfinder.dto.response.AuthResponse;
import com.prayer.pointfinder.dto.response.UserResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.OperatorInviteRepository;
import com.prayer.pointfinder.repository.PasswordResetTokenRepository;
import com.prayer.pointfinder.repository.RefreshTokenRepository;
import com.prayer.pointfinder.repository.UserRepository;
import com.prayer.pointfinder.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuthService {

    static final int MAX_CONCURRENT_REFRESH_TOKENS = 5;
    static final Duration ABSOLUTE_SESSION_LIFETIME = Duration.ofDays(30);

    private static final int MAX_ACTIVE_RESET_TOKENS = 3;
    private static final long RESET_TOKEN_EXPIRY_MS = 3_600_000; // 1 hour

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final OperatorInviteRepository inviteRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;
    private final EmailService emailService;
    private final LoginAttemptService loginAttemptService;

    @Transactional(timeout = 10)
    public AuthResponse login(LoginRequest request) {
        if (loginAttemptService.isBlocked(request.getEmail())) {
            throw new BadRequestException("Too many login attempts. Please try again later.");
        }

        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> {
                    loginAttemptService.recordFailure(request.getEmail());
                    return new BadCredentialsException("Invalid credentials");
                });

        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            loginAttemptService.recordFailure(request.getEmail());
            throw new BadCredentialsException("Invalid credentials");
        }

        loginAttemptService.recordSuccess(request.getEmail());
        return generateAuthResponse(user);
    }

    @Transactional(timeout = 10)
    public AuthResponse register(String inviteToken, RegisterRequest request) {
        OperatorInvite invite = inviteRepository.findByToken(inviteToken)
                .orElseThrow(() -> new ResourceNotFoundException("Invalid invite token"));

        if (invite.getStatus() != InviteStatus.pending) {
            throw new BadRequestException("Invite has already been used or expired");
        }

        if (!invite.getEmail().equalsIgnoreCase(request.getEmail())) {
            throw new BadRequestException("Email does not match the invitation");
        }

        if (userRepository.existsByEmail(request.getEmail())) {
            throw new BadRequestException("Email already registered");
        }

        validatePassword(request.getPassword());

        User user = User.builder()
                .email(request.getEmail())
                .name(request.getName())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .role(UserRole.operator)
                .build();
        user = userRepository.save(user);

        invite.setStatus(InviteStatus.accepted);
        inviteRepository.save(invite);

        // If the invite was game-specific, add user as game operator
        if (invite.getGame() != null) {
            invite.getGame().getOperators().add(user);
        }

        return generateAuthResponse(user);
    }

    @Transactional(timeout = 10)
    public void requestRegistration(String email, String requestHost) {
        // Silent return if already registered — no email enumeration
        if (userRepository.existsByEmail(email)) {
            return;
        }

        // If there's already a pending self-registration invite for this email, don't create another
        Optional<OperatorInvite> existing = inviteRepository.findByEmailAndStatusAndInvitedByIsNull(
                email, InviteStatus.pending);
        if (existing.isPresent()) {
            // Re-send the email with the existing token
            emailService.sendSelfRegistrationEmail(email, existing.get().getToken(), requestHost);
            return;
        }

        OperatorInvite invite = OperatorInvite.builder()
                .email(email)
                .token(UUID.randomUUID().toString())
                .status(InviteStatus.pending)
                .build();
        inviteRepository.save(invite);

        emailService.sendSelfRegistrationEmail(email, invite.getToken(), requestHost);
    }

    @Transactional(timeout = 10)
    public AuthResponse refreshToken(String refreshTokenStr) {
        RefreshToken storedToken = refreshTokenRepository.findByToken(refreshTokenStr)
                .orElseThrow(() -> new BadRequestException("Invalid refresh token"));

        if (storedToken.isExpired()) {
            refreshTokenRepository.delete(storedToken);
            throw new BadRequestException("Refresh token expired");
        }

        // Absolute session lifetime: reject tokens created more than 30 days ago
        if (storedToken.getCreatedAt() != null &&
                Instant.now().isAfter(storedToken.getCreatedAt().plus(ABSOLUTE_SESSION_LIFETIME))) {
            refreshTokenRepository.delete(storedToken);
            throw new BadRequestException("Session expired. Please log in again.");
        }

        // Delete old refresh token
        refreshTokenRepository.delete(storedToken);

        return generateAuthResponse(storedToken.getUser());
    }

    @Transactional(timeout = 10)
    public void logout(String refreshTokenStr) {
        refreshTokenRepository.deleteByToken(refreshTokenStr);
    }

    @Transactional(timeout = 10)
    public void requestPasswordReset(String email, String requestHost) {
        Optional<User> userOpt = userRepository.findByEmail(email);
        if (userOpt.isEmpty()) {
            return; // Silent return — no email enumeration
        }

        User user = userOpt.get();

        long activeTokens = passwordResetTokenRepository
                .countByUserIdAndUsedFalseAndExpiresAtAfter(user.getId(), Instant.now());
        if (activeTokens >= MAX_ACTIVE_RESET_TOKENS) {
            return; // Rate limit exceeded — silent return
        }

        String token = UUID.randomUUID().toString();
        PasswordResetToken resetToken = PasswordResetToken.builder()
                .user(user)
                .token(token)
                .expiresAt(Instant.now().plusMillis(RESET_TOKEN_EXPIRY_MS))
                .build();
        passwordResetTokenRepository.save(resetToken);

        emailService.sendPasswordResetEmail(user.getEmail(), token, requestHost);
    }

    @Transactional(timeout = 10)
    public void resetPassword(String token, String newPassword) {
        PasswordResetToken resetToken = passwordResetTokenRepository.findByToken(token)
                .orElseThrow(() -> new BadRequestException("Invalid reset token"));

        if (resetToken.isUsed()) {
            throw new BadRequestException("This reset link has already been used");
        }

        if (resetToken.isExpired()) {
            throw new BadRequestException("This reset link has expired");
        }

        validatePassword(newPassword);

        User user = resetToken.getUser();
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);

        resetToken.setUsed(true);
        passwordResetTokenRepository.save(resetToken);

        // Invalidate all other reset tokens for this user
        passwordResetTokenRepository.invalidateAllForUser(user.getId());

        // Delete all refresh tokens to log out all sessions
        refreshTokenRepository.deleteByUserId(user.getId());
    }

    void validatePassword(String password) {
        if (password == null || password.length() < 8) {
            throw new BadRequestException("Password must be at least 8 characters long");
        }
        if (password.length() > 128) {
            throw new BadRequestException("Password must not exceed 128 characters");
        }
        if (!password.chars().anyMatch(Character::isUpperCase)) {
            throw new BadRequestException("Password must contain at least one uppercase letter");
        }
        if (!password.chars().anyMatch(Character::isDigit)) {
            throw new BadRequestException("Password must contain at least one digit");
        }
    }

    private AuthResponse generateAuthResponse(User user) {
        String accessToken = tokenProvider.generateAccessToken(
                user.getId(), user.getEmail(), user.getRole().name());

        String refreshTokenStr = tokenProvider.generateRefreshTokenString();

        RefreshToken refreshToken = RefreshToken.builder()
                .user(user)
                .token(refreshTokenStr)
                .expiresAt(Instant.now().plusMillis(tokenProvider.getRefreshTokenExpirationMs()))
                .build();
        refreshTokenRepository.save(refreshToken);

        // Enforce concurrent refresh token limit per user
        enforceTokenLimit(user.getId());

        UserResponse userResponse = UserResponse.builder()
                .id(user.getId())
                .email(user.getEmail())
                .name(user.getName())
                .role(user.getRole().name())
                .createdAt(user.getCreatedAt())
                .build();

        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshTokenStr)
                .user(userResponse)
                .build();
    }

    private void enforceTokenLimit(UUID userId) {
        long tokenCount = refreshTokenRepository.countByUserId(userId);
        if (tokenCount > MAX_CONCURRENT_REFRESH_TOKENS) {
            List<RefreshToken> tokens = refreshTokenRepository.findByUserIdOrderByCreatedAtAsc(userId);
            // Delete the oldest tokens to bring count within limit
            long toDelete = tokenCount - MAX_CONCURRENT_REFRESH_TOKENS;
            for (int i = 0; i < toDelete && i < tokens.size(); i++) {
                refreshTokenRepository.delete(tokens.get(i));
            }
        }
    }
}
