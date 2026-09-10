package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.PlayerAccountLinkRequest;
import com.prayer.pointfinder.dto.request.PlayerRecoverRequest;
import com.prayer.pointfinder.dto.response.PlayerAccountResponse;
import com.prayer.pointfinder.dto.response.PlayerAuthResponse;
import com.prayer.pointfinder.entity.EmailChangeToken;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.IndividualTier;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.SubscriptionStatus;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserRole;
import com.prayer.pointfinder.entity.UserSubscription;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ConflictException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.EmailChangeTokenRepository;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.PlayerRepository;
import com.prayer.pointfinder.repository.TeamRepository;
import com.prayer.pointfinder.repository.UserRepository;
import com.prayer.pointfinder.repository.UserSubscriptionRepository;
import com.prayer.pointfinder.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * PF-01/PF-02: attach a guest participation to an account, and recover it on
 * another device. The player row is linked in place: its id, token, offline
 * queue, caches and upload sessions never change on a claim. A claim that
 * collides with the account's existing participation in the same game is
 * refused with a typed conflict; two rows are never merged.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class PlayerAccountService {

    private static final long VERIFICATION_TOKEN_EXPIRY_MS = 24L * 60 * 60 * 1000;

    private final PlayerRepository playerRepository;
    private final UserRepository userRepository;
    private final TeamRepository teamRepository;
    private final GameRepository gameRepository;
    private final UserSubscriptionRepository userSubRepository;
    private final EmailChangeTokenRepository emailChangeTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final LoginAttemptService loginAttemptService;
    private final JwtTokenProvider tokenProvider;
    private final EmailService emailService;
    private final AuthService authService;

    @Transactional(readOnly = true)
    public PlayerAccountResponse account(Player authPlayer) {
        Player player = load(authPlayer);
        User user = player.getUser();
        if (user == null) return PlayerAccountResponse.guest();
        return new PlayerAccountResponse(true, user.getEmail(), user.getName(), Boolean.TRUE.equals(user.getEmailVerified()));
    }

    @Transactional(timeout = 10)
    public PlayerAccountResponse link(Player authPlayer, PlayerAccountLinkRequest request, String requestHost) {
        Player player = load(authPlayer);
        String email = request.getEmail().trim();

        UUID gameId = player.getGame().getId();
        User user;
        if (request.isCreateAccount()) {
            // Refuse before creating anything, so a rollback never leaves a sent welcome mail behind.
            if (player.getUser() != null) {
                throw new ConflictException("This participation already belongs to an account", ErrorCode.PLAYER_ALREADY_LINKED);
            }
            user = createParticipant(email, request.getName(), request.getPassword(), requestHost);
        } else {
            user = authenticate(email, request.getPassword());
            if (player.getUser() != null) {
                if (player.getUser().getId().equals(user.getId())) {
                    return new PlayerAccountResponse(true, user.getEmail(), user.getName(), Boolean.TRUE.equals(user.getEmailVerified()));
                }
                throw new ConflictException("This participation already belongs to another account", ErrorCode.PLAYER_ALREADY_LINKED);
            }
            playerRepository.findByUserIdAndGameId(user.getId(), gameId).ifPresent(existing -> {
                throw alreadyInGame(existing, player);
            });
        }

        player.setUser(user);
        try {
            playerRepository.saveAndFlush(player);
        } catch (DataIntegrityViolationException ex) {
            // Two devices claimed the same account for the same game at once; the index decided.
            Player existing = playerRepository.findByUserIdAndGameId(user.getId(), gameId)
                    .orElseThrow(() -> new ConflictException("Could not link this participation", ErrorCode.ACCOUNT_ALREADY_IN_GAME));
            throw alreadyInGame(existing, player);
        }
        log.info("[ACCOUNT] operation=link playerId={} userId={} gameId={} created={}",
                player.getId(), user.getId(), gameId, request.isCreateAccount());
        return new PlayerAccountResponse(true, user.getEmail(), user.getName(), Boolean.TRUE.equals(user.getEmailVerified()));
    }

    /**
     * Same response shape as join, for the account's existing row. The recovering
     * device becomes the participation's device, so its push registration and a
     * later guest rejoin on this device both resolve to the same participation.
     */
    @Transactional(timeout = 10)
    public PlayerAuthResponse recover(PlayerRecoverRequest request) {
        User user = authenticate(request.getEmail().trim(), request.getPassword());
        Game game = resolveGame(request);
        if (game.getStatus() == GameStatus.ended) {
            throw new BadRequestException("Game has ended");
        }
        Player player = playerRepository.findByUserIdAndGameId(user.getId(), game.getId())
                .orElseThrow(() -> new BadRequestException("This account has not joined this game", ErrorCode.NO_PARTICIPATION_FOUND));

        player.setDeviceId(request.getDeviceId());
        player = playerRepository.save(player);
        Team team = player.getTeam();
        log.info("[ACCOUNT] operation=recover playerId={} userId={} gameId={}", player.getId(), user.getId(), game.getId());
        String jwt = tokenProvider.generatePlayerToken(player.getId(), team.getId(), game.getId());
        return PlayerAuthResponse.of(jwt, player, team, game);
    }

    // --- helpers ---

    private Player load(Player authPlayer) {
        return playerRepository.findById(authPlayer.getId())
                .orElseThrow(() -> new BadRequestException("Player not found"));
    }

    private ConflictException alreadyInGame(Player existing, Player claiming) {
        Team team = existing.getTeam();
        boolean sameTeam = team.getId().equals(claiming.getTeam().getId());
        return new ConflictException(
                "This account already plays in this game",
                ErrorCode.ACCOUNT_ALREADY_IN_GAME,
                Map.of("teamId", team.getId().toString(), "teamName", team.getName(), "sameTeam", String.valueOf(sameTeam)));
    }

    private User authenticate(String email, String password) {
        if (loginAttemptService.isBlocked(email)) {
            throw new BadRequestException("Too many login attempts. Please try again later.");
        }
        User user = userRepository.findByEmailIgnoreCase(email).orElse(null);
        if (user == null || !passwordEncoder.matches(password, user.getPasswordHash())) {
            loginAttemptService.recordFailure(email);
            // 400, not 401: the caller may hold a valid player token, and clients treat a 401 as a revoked session.
            throw new BadRequestException("Invalid credentials", ErrorCode.INVALID_CREDENTIALS);
        }
        loginAttemptService.recordSuccess(email);
        return user;
    }

    private User createParticipant(String email, String name, String password, String requestHost) {
        if (name == null || name.isBlank()) {
            throw new BadRequestException("Name is required to create an account");
        }
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new BadRequestException("Email already registered", ErrorCode.EMAIL_ALREADY_TAKEN);
        }
        authService.validatePassword(password);

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

        EmailChangeToken token = emailChangeTokenRepository.save(EmailChangeToken.builder()
                .user(user)
                .newEmail(email)
                .token(UUID.randomUUID().toString())
                .expiresAt(Instant.now().plusMillis(VERIFICATION_TOKEN_EXPIRY_MS))
                .build());
        emailService.sendParticipantVerification(email, token.getToken(), requestHost);
        return user;
    }

    private Game resolveGame(PlayerRecoverRequest request) {
        if (request.getJoinCode() != null && !request.getJoinCode().isBlank()) {
            return teamRepository.findByJoinCode(request.getJoinCode().trim())
                    .map(Team::getGame)
                    .orElseThrow(() -> new BadRequestException("Invalid join code"));
        }
        if (request.getGameId() != null) {
            return gameRepository.findById(request.getGameId())
                    .orElseThrow(() -> new BadRequestException("Invalid join code"));
        }
        throw new BadRequestException("A join code or game is required");
    }
}
