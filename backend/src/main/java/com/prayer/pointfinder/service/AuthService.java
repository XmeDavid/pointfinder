package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.ChangePasswordRequest;
import com.prayer.pointfinder.dto.request.LoginRequest;
import com.prayer.pointfinder.dto.request.RegisterRequest;
import com.prayer.pointfinder.dto.response.AuthResponse;
import com.prayer.pointfinder.dto.response.UserResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.EmailChangeTokenRepository;
import com.prayer.pointfinder.repository.OperatorInviteRepository;
import com.prayer.pointfinder.repository.OrgInviteRepository;
import com.prayer.pointfinder.repository.PasswordResetTokenRepository;
import com.prayer.pointfinder.repository.RefreshTokenRepository;
import com.prayer.pointfinder.repository.UserRepository;
import com.prayer.pointfinder.repository.UserSubscriptionRepository;
import com.prayer.pointfinder.security.JwtTokenProvider;
import com.prayer.pointfinder.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionSynchronization;

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
    private static final long VERIFICATION_TOKEN_EXPIRY_MS = 24L * 60 * 60 * 1000;

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final OperatorInviteRepository inviteRepository;
    private final OrgInviteRepository orgInviteRepository;
    private final OrgInviteService orgInviteService;
    private final EmailChangeTokenRepository emailChangeTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;
    private final EmailService emailService;
    private final UserSubscriptionRepository userSubRepository;
    private final LoginAttemptService loginAttemptService;
    private final QuotaService quotaService;

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
        // A participant account signs in here too (the player app keeps it signed in);
        // the operator-only security default is what keeps that token harmless elsewhere.
        return generateAuthResponse(user);
    }

    @Transactional(timeout = 10)
    public AuthResponse register(String inviteToken, RegisterRequest request) {
        OperatorInvite invite = inviteRepository.findByToken(inviteToken).orElse(null);
        if (invite == null) {
            // Not an operator invite: it may be an org invite, the link a club
            // administrator receives when an admin creates their club for an
            // address that has no account yet.
            return registerFromOrgInvite(inviteToken, request);
        }

        if (invite.getStatus() != InviteStatus.pending) {
            throw new BadRequestException("Invite has already been used or expired");
        }

        if (!invite.getEmail().equalsIgnoreCase(request.getEmail())) {
            throw new BadRequestException("Email does not match the invitation");
        }

        User parked = unverifiedParticipantFor(request.getEmail());
        if (parked == null && userRepository.existsByEmailIgnoreCase(request.getEmail())) {
            throw new BadRequestException("Email already registered");
        }

        // Registering through a game invite is an accept, so it answers to the
        // same operator limit — checked before the account is created, so a
        // refusal does not leave a user behind.
        if (invite.getGame() != null) {
            quotaService.enforceOperatorsPerGameLimit(invite.getGame());
        }

        validatePassword(request.getPassword());

        User user = parked != null
                ? takeOverUnverifiedParticipant(parked, request.getName(), request.getPassword(), UserRole.operator)
                : userRepository.save(User.builder()
                        .email(request.getEmail())
                        .name(request.getName())
                        .passwordHash(passwordEncoder.encode(request.getPassword()))
                        .role(UserRole.operator)
                        .build());

        invite.setStatus(InviteStatus.accepted);
        inviteRepository.save(invite);

        // If the invite was game-specific, add user as game operator
        if (invite.getGame() != null) {
            invite.getGame().getOperators().add(user);
        }

        // Create free-tier subscription row so checkout webhooks can find it
        if (parked == null) {
            userSubRepository.save(UserSubscription.builder()
                    .user(user)
                    .tier(IndividualTier.free)
                    .status(SubscriptionStatus.active)
                    .build());
        }

        return generateAuthResponse(user);
    }

    /**
     * Registration from an {@code org_invites} token.
     *
     * <p>Creating the account and joining the org happen in one transaction, so
     * the invitee's very first authenticated request already sees the club.
     * Before this existed, {@code OrgInviteService.acceptInviteByToken} had no
     * caller at all and an invited club administrator landed in an empty
     * account with a pending invite they could not reach.
     */
    private AuthResponse registerFromOrgInvite(String inviteToken, RegisterRequest request) {
        OrgInvite orgInvite = orgInviteRepository.findByToken(inviteToken)
                .orElseThrow(() -> new ResourceNotFoundException("Invalid invite token"));

        if (orgInvite.getStatus() != InviteStatus.pending) {
            throw new BadRequestException("Invite has already been used or expired");
        }

        if (orgInvite.isExpiredAt(Instant.now())) {
            throw new BadRequestException("Invite has already been used or expired");
        }

        if (!orgInvite.getEmail().equalsIgnoreCase(request.getEmail())) {
            throw new BadRequestException("Email does not match the invitation");
        }

        User parked = unverifiedParticipantFor(request.getEmail());
        if (parked == null && userRepository.existsByEmailIgnoreCase(request.getEmail())) {
            throw new BadRequestException("Email already registered");
        }

        validatePassword(request.getPassword());

        User user;
        if (parked != null) {
            user = takeOverUnverifiedParticipant(parked, request.getName(), request.getPassword(), UserRole.operator);
        } else {
            user = userRepository.save(User.builder()
                    .email(request.getEmail())
                    .name(request.getName())
                    .passwordHash(passwordEncoder.encode(request.getPassword()))
                    .role(UserRole.operator)
                    .build());
            userSubRepository.save(UserSubscription.builder()
                    .user(user)
                    .tier(IndividualTier.free)
                    .status(SubscriptionStatus.active)
                    .build());
        }
        orgInviteService.acceptInviteByToken(inviteToken, user);

        return generateAuthResponse(user);
    }

    @Transactional(timeout = 10)
    public void requestRegistration(String email, String requestHost) {
        // Silent return if already registered — no email enumeration
        if (unverifiedParticipantFor(email) == null && userRepository.existsByEmailIgnoreCase(email)) {
            // An unverified participant that merely parked this address does not count:
            // the mailed link is exactly what lets the real owner take it over.
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

        // Grace period: keep old token valid for 30 seconds instead of deleting
        // immediately. This handles the race condition where a page refresh kills
        // the browser before the new token response is processed — the client
        // retries with the old token on reload and it still works.
        storedToken.setExpiresAt(Instant.now().plusSeconds(30));
        refreshTokenRepository.save(storedToken);

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
    public UserRole resetPassword(String token, String newPassword) {
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
        // Bump token_version so every access JWT minted before the reset is
        // rejected by JwtAuthenticationFilter. Refresh tokens are also wiped
        // below; the tv bump closes the ~15 min window where a stolen access
        // token could otherwise continue to work after reset.
        bumpTokenVersion(user);
        userRepository.save(user);

        resetToken.setUsed(true);
        passwordResetTokenRepository.save(resetToken);

        // Invalidate all other reset tokens for this user
        passwordResetTokenRepository.invalidateAllForUser(user.getId());

        // Delete all refresh tokens to log out all sessions
        refreshTokenRepository.deleteByUserId(user.getId());
        return user.getRole();
    }

    /**
     * Centralised tv++ helper so every password / role / force-logout path
     * bumps consistently. Initialises null values (legacy rows before V54's
     * default) to a fresh counter of 1.
     */
    private void bumpTokenVersion(User user) {
        int current = user.getTokenVersion() != null ? user.getTokenVersion() : 0;
        user.setTokenVersion(current + 1);
    }

    @Transactional(timeout = 10)
    public void changePassword(ChangePasswordRequest request) {
        User user = SecurityUtils.getCurrentUser();

        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPasswordHash())) {
            throw new BadRequestException("Current password is incorrect", ErrorCode.INVALID_CURRENT_PASSWORD);
        }

        validatePassword(request.getNewPassword());

        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        bumpTokenVersion(user);
        userRepository.save(user);

        // Invalidate all other sessions, keep the caller's
        refreshTokenRepository.deleteByUserIdAndTokenNot(user.getId(), request.getRefreshToken());
    }

    @Transactional(timeout = 10)
    public User confirmEmailChange(String tokenStr) {
        EmailChangeToken token = emailChangeTokenRepository.findByToken(tokenStr)
                .orElseThrow(() -> new BadRequestException("Invalid email change token", ErrorCode.EMAIL_CHANGE_TOKEN_INVALID));

        if (token.isUsed()) {
            throw new BadRequestException("This link has already been used", ErrorCode.EMAIL_CHANGE_TOKEN_INVALID);
        }

        if (token.isExpired()) {
            throw new BadRequestException("This link has expired", ErrorCode.EMAIL_CHANGE_TOKEN_EXPIRED);
        }

        User user = token.getUser();
        boolean sameAddress = token.getNewEmail().equalsIgnoreCase(user.getEmail());

        // A participant signup verifies the address it already has; a change must not
        // land on an address taken since the request was made.
        if (!sameAddress && userRepository.existsByEmail(token.getNewEmail())) {
            throw new BadRequestException("Email is already taken", ErrorCode.EMAIL_ALREADY_TAKEN);
        }

        if (!sameAddress) user.setEmail(token.getNewEmail());
        user.setEmailVerified(true);
        userRepository.save(user);

        token.setUsed(true);
        emailChangeTokenRepository.save(token);

        // Invalidate any other pending email change tokens for this user
        emailChangeTokenRepository.invalidateAllForUser(user.getId());
        return user;
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

    /**
     * PF-02: self-serve signup from the player app. The account starts unverified and
     * a verification mail goes out after commit; verification never gates play.
     */
    @Transactional(timeout = 10)
    public AuthResponse registerParticipant(String email, String name, String password, String requestHost) {
        return generateAuthResponse(createParticipant(email, name, password, requestHost));
    }

    /** Creates an unverified participant and schedules its verification mail for after commit. */
    @Transactional(timeout = 10)
    public User createParticipant(String email, String name, String password, String requestHost) {
        if (name == null || name.isBlank()) {
            throw new BadRequestException("Name is required to create an account");
        }
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new BadRequestException("Email already registered", ErrorCode.EMAIL_ALREADY_TAKEN);
        }
        validatePassword(password);

        User user = userRepository.save(User.builder()
                .email(email)
                .name(name.trim())
                .passwordHash(passwordEncoder.encode(password))
                .role(UserRole.participant)
                .emailVerified(false)
                .build());
        // Every account owns a free personal plan row so billing lookups never miss.
        userSubRepository.save(UserSubscription.builder()
                .user(user)
                .tier(IndividualTier.free)
                .status(SubscriptionStatus.active)
                .build());
        sendVerificationAfterCommit(user, requestHost);
        return user;
    }

    /** Issues a fresh verification link for a signed-in, still unverified account. */
    @Transactional(timeout = 10)
    public void resendVerification(User authUser, String requestHost) {
        User user = userRepository.findById(authUser.getId()).orElseThrow(() -> new BadRequestException("User not found"));
        if (Boolean.TRUE.equals(user.getEmailVerified())) return;
        emailChangeTokenRepository.invalidateAllForUser(user.getId());
        sendVerificationAfterCommit(user, requestHost);
    }

    private void sendVerificationAfterCommit(User user, String requestHost) {
        EmailChangeToken token = emailChangeTokenRepository.save(EmailChangeToken.builder()
                .user(user)
                .newEmail(user.getEmail())
                .token(UUID.randomUUID().toString())
                .expiresAt(Instant.now().plusMillis(VERIFICATION_TOKEN_EXPIRY_MS))
                .build());
        String email = user.getEmail();
        String verificationToken = token.getToken();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    emailService.sendParticipantVerification(email, verificationToken, requestHost);
                }
            });
        } else {
            emailService.sendParticipantVerification(email, verificationToken, requestHost);
        }
    }

    /** An address is only "taken" for registration when its owner proved the mailbox. */
    private User unverifiedParticipantFor(String email) {
        return userRepository.findByEmailIgnoreCase(email)
                .filter(u -> u.getRole() == UserRole.participant && !Boolean.TRUE.equals(u.getEmailVerified()))
                .orElse(null);
    }

    /**
     * A mailed invite token proves control of the address, so whoever parked it as an
     * unverified participant loses it: new credentials, the invited role, and every
     * token minted for the parked account stops working. Linked participations stay
     * with the account, which now belongs to the mailbox owner.
     */
    private User takeOverUnverifiedParticipant(User parked, String name, String password, UserRole role) {
        parked.setName(name);
        parked.setPasswordHash(passwordEncoder.encode(password));
        parked.setRole(role);
        parked.setEmailVerified(true);
        bumpTokenVersion(parked);
        refreshTokenRepository.deleteByUserId(parked.getId());
        emailChangeTokenRepository.invalidateAllForUser(parked.getId());
        return userRepository.save(parked);
    }

    private AuthResponse generateAuthResponse(User user) {
        int tokenVersion = user.getTokenVersion() != null ? user.getTokenVersion() : 0;
        String accessToken = tokenProvider.generateAccessToken(
                user.getId(), user.getEmail(), user.getRole().name(), tokenVersion);

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
