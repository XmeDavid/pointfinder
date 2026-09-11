package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.PlayerAccountLinkRequest;
import com.prayer.pointfinder.dto.request.PlayerJoinRequest;
import com.prayer.pointfinder.dto.request.PlayerRecoverRequest;
import com.prayer.pointfinder.dto.response.PlayerAccountResponse;
import com.prayer.pointfinder.dto.response.PlayerAuthResponse;
import com.prayer.pointfinder.entity.ActivityEvent;
import com.prayer.pointfinder.entity.ActivityEventType;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ConflictException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.ActivityEventRepository;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.PlayerRepository;
import com.prayer.pointfinder.repository.TeamRepository;
import com.prayer.pointfinder.repository.UserRepository;
import com.prayer.pointfinder.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
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

    private final PlayerRepository playerRepository;
    private final UserRepository userRepository;
    private final TeamRepository teamRepository;
    private final GameRepository gameRepository;
    private final PasswordEncoder passwordEncoder;
    private final LoginAttemptService loginAttemptService;
    private final JwtTokenProvider tokenProvider;
    private final AuthService authService;
    private final PlayerJoinService playerJoinService;
    private final ActivityEventRepository activityEventRepository;
    private final com.prayer.pointfinder.repository.PlayerPushTokenRepository playerPushTokenRepository;
    private final com.prayer.pointfinder.xp.XpService xpService;

    /** A retired guest row keeps its data but can never be resolved by a device again. */
    public static final String RETIRED_DEVICE_PREFIX = "retired:";

    @Transactional(readOnly = true)
    public PlayerAccountResponse account(Player authPlayer) {
        return toResponse(load(authPlayer).getUser());
    }

    /**
     * Links the calling guest row to an account: the phone's signed-in account
     * (by its access token), credentials, or a brand-new participant account.
     */
    @Transactional(timeout = 10)
    public PlayerAccountResponse link(Player authPlayer, PlayerAccountLinkRequest request, String requestHost) {
        Player player = load(authPlayer);
        UUID gameId = player.getGame().getId();
        User user;
        if (request.getAccountAccessToken() != null && !request.getAccountAccessToken().isBlank()) {
            user = userFromAccessToken(request.getAccountAccessToken());
        } else if (request.isCreateAccount()) {
            // Refuse before creating anything, so a rollback never leaves a sent welcome mail behind.
            if (player.getUser() != null) {
                throw new ConflictException("This participation already belongs to an account", ErrorCode.PLAYER_ALREADY_LINKED);
            }
            requireCredentials(request);
            user = authService.createParticipant(request.getEmail().trim(), request.getName(), request.getPassword(), requestHost);
        } else {
            requireCredentials(request);
            user = authenticate(request.getEmail().trim(), request.getPassword());
        }

        if (player.getUser() != null) {
            if (player.getUser().getId().equals(user.getId())) return toResponse(user);
            throw new ConflictException("This participation already belongs to another account", ErrorCode.PLAYER_ALREADY_LINKED);
        }
        playerRepository.findByUserIdAndGameId(user.getId(), gameId).ifPresent(existing -> {
            throw alreadyInGame(existing, player);
        });

        player.setUser(user);
        try {
            playerRepository.saveAndFlush(player);
        } catch (DataIntegrityViolationException ex) {
            // Two devices claimed the same account for the same game at once and the index
            // decided. The persistence context is unusable after the violation, so answer
            // the conflict without touching it; the retry sees the winner through the pre-check.
            throw new ConflictException("This account already plays in this game", ErrorCode.ACCOUNT_ALREADY_IN_GAME);
        }
        xpService.reassignPlayer(player.getId(), user.getId());
        log.info("[ACCOUNT] operation=link playerId={} userId={} gameId={} created={}",
                player.getId(), user.getId(), gameId, request.isCreateAccount());
        return toResponse(user);
    }

    /** The row becomes a guest again. Progress stays with the team; the phone keeps playing. */
    @Transactional(timeout = 10)
    public PlayerAccountResponse unlink(Player authPlayer) {
        Player player = load(authPlayer);
        if (player.getUser() != null) {
            log.info("[ACCOUNT] operation=unlink playerId={} userId={}", player.getId(), player.getUser().getId());
            player.setUser(null);
            playerRepository.save(player);
            xpService.reassignPlayer(player.getId(), null);
        }
        return PlayerAccountResponse.guest();
    }

    /** Same response shape as join, for the account's existing row, with credentials in the body. */
    @Transactional(timeout = 10)
    public PlayerAuthResponse recover(PlayerRecoverRequest request) {
        User user = authenticate(request.getEmail().trim(), request.getPassword());
        Game game = resolveGame(request.getJoinCode(), request.getGameId());
        return recoverFor(user, game, request.getDeviceId());
    }

    /** Same, for a phone that is already signed in. */
    @Transactional(timeout = 10)
    public PlayerAuthResponse recoverForAccount(User authUser, UUID gameId, String deviceId) {
        User user = userRepository.findById(authUser.getId()).orElseThrow(() -> new BadRequestException("User not found"));
        return recoverFor(user, resolveGame(null, gameId), deviceId);
    }

    /**
     * The only join a signed-in phone uses: an account that already plays this game
     * gets its participation back, anyone else joins as a guest would and the new
     * row is linked at once. So a signed-in phone can never become a second competitor.
     */
    @Transactional(timeout = 10)
    public PlayerAuthResponse joinForAccount(User authUser, String joinCode, String displayName, String deviceId) {
        User user = userRepository.findById(authUser.getId()).orElseThrow(() -> new BadRequestException("User not found"));
        Game game = resolveGame(joinCode, null);
        if (playerRepository.findByUserIdAndGameId(user.getId(), game.getId()).isPresent()) {
            return recoverFor(user, game, deviceId);
        }
        PlayerJoinRequest join = new PlayerJoinRequest();
        join.setJoinCode(joinCode.trim());
        join.setDisplayName(displayName);
        join.setDeviceId(deviceId);
        PlayerAuthResponse joined = playerJoinService.joinTeam(join);
        Player player = playerRepository.findById(joined.player().id()).orElseThrow(() -> new BadRequestException("Join failed, please try again"));
        if (player.getUser() != null && !player.getUser().getId().equals(user.getId())) {
            // The phone's existing guest row here already belongs to someone else's account.
            throw new BadRequestException("This device already belongs to another account's participation in this game",
                    ErrorCode.DEVICE_ALREADY_IN_DIFFERENT_TEAM);
        }
        player.setUser(user);
        try {
            playerRepository.saveAndFlush(player);
        } catch (DataIntegrityViolationException ex) {
            throw new ConflictException("This account already plays in this game", ErrorCode.ACCOUNT_ALREADY_IN_GAME);
        }
        xpService.reassignPlayer(player.getId(), user.getId());
        log.info("[ACCOUNT] operation=joinForAccount playerId={} userId={} gameId={}", player.getId(), user.getId(), game.getId());
        return joined;
    }

    // --- helpers ---

    private PlayerAuthResponse recoverFor(User user, Game game, String deviceId) {
        if (game.getStatus() == GameStatus.ended) {
            throw new BadRequestException("Game has ended");
        }
        Player player = playerRepository.findByUserIdAndGameId(user.getId(), game.getId())
                .orElseThrow(() -> new BadRequestException("This account has not joined this game", ErrorCode.NO_PARTICIPATION_FOUND));

        releaseDevice(deviceId, game.getId(), player);
        player.setDeviceId(deviceId);
        player = playerRepository.save(player);
        Team team = player.getTeam();
        log.info("[ACCOUNT] operation=recover playerId={} userId={} gameId={}", player.getId(), user.getId(), game.getId());
        String jwt = tokenProvider.generatePlayerToken(player.getId(), team.getId(), game.getId());
        return PlayerAuthResponse.of(jwt, player, team, game);
    }

    /**
     * A device holds one identity per game, which join enforces. Switching a phone to
     * the account's participation retires the guest row that phone had here, so a later
     * guest rejoin resolves to the recovered row. The row itself stays: its check-ins,
     * submissions and locations belong to the team and cascade from the row. A row that
     * belongs to another account is never taken over. The switch is audited.
     */
    private void releaseDevice(String deviceId, UUID gameId, Player recovered) {
        Player holder = playerRepository.findFirstByDeviceIdAndTeamGameIdOrderByCreatedAtDesc(deviceId, gameId).orElse(null);
        if (holder == null || holder.getId().equals(recovered.getId())) return;
        if (holder.getUser() != null) {
            throw new BadRequestException("This device already belongs to another account's participation in this game",
                    ErrorCode.DEVICE_ALREADY_IN_DIFFERENT_TEAM);
        }
        holder.setDeviceId(RETIRED_DEVICE_PREFIX + UUID.randomUUID());
        playerRepository.save(holder);
        // The phone re-registers under the recovered row; the retired row must not keep ringing it.
        playerPushTokenRepository.deleteByPlayerId(holder.getId());
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("retiredPlayerId", holder.getId().toString());
        metadata.put("retiredTeamId", holder.getTeam().getId().toString());
        metadata.put("recoveredPlayerId", recovered.getId().toString());
        metadata.put("recoveredTeamId", recovered.getTeam().getId().toString());
        metadata.put("deviceId", deviceId);
        activityEventRepository.save(ActivityEvent.builder()
                .game(recovered.getGame())
                .type(ActivityEventType.team_switch)
                .team(recovered.getTeam())
                .message(holder.getDisplayName() + " switched this phone from " + holder.getTeam().getName() + " to their saved participation in " + recovered.getTeam().getName())
                .timestamp(Instant.now())
                .actorPlayer(recovered)
                .actorDisplayNameSnapshot(recovered.getDisplayName())
                .actorDeviceIdSnapshot(deviceId)
                .sourceSurface("player_app")
                .metadata(metadata)
                .build());
        log.info("[ACCOUNT] operation=recover retiredGuestPlayerId={} deviceId={} gameId={}", holder.getId(), deviceId, gameId);
    }

    private Player load(Player authPlayer) {
        return playerRepository.findById(authPlayer.getId())
                .orElseThrow(() -> new BadRequestException("Player not found"));
    }

    private static PlayerAccountResponse toResponse(User user) {
        if (user == null) return PlayerAccountResponse.guest();
        return new PlayerAccountResponse(true, user.getEmail(), user.getName(), Boolean.TRUE.equals(user.getEmailVerified()));
    }

    private static void requireCredentials(PlayerAccountLinkRequest request) {
        if (request.getEmail() == null || request.getEmail().isBlank() || request.getPassword() == null || request.getPassword().isBlank()) {
            throw new BadRequestException("Email and password are required");
        }
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

    /** The phone's account session, presented in the body of a player-token call. */
    private User userFromAccessToken(String accessToken) {
        try {
            if (!tokenProvider.validateToken(accessToken) || !"user".equals(tokenProvider.getTokenType(accessToken))) {
                throw new BadRequestException("Invalid account session", ErrorCode.INVALID_CREDENTIALS);
            }
            UUID userId = tokenProvider.getUserIdFromToken(accessToken);
            User user = userRepository.findById(userId).orElseThrow(() -> new BadRequestException("Invalid account session", ErrorCode.INVALID_CREDENTIALS));
            int current = user.getTokenVersion() != null ? user.getTokenVersion() : 0;
            if (tokenProvider.getTokenVersion(accessToken) < current) {
                throw new BadRequestException("Invalid account session", ErrorCode.INVALID_CREDENTIALS);
            }
            return user;
        } catch (io.jsonwebtoken.JwtException | IllegalArgumentException ex) {
            throw new BadRequestException("Invalid account session", ErrorCode.INVALID_CREDENTIALS);
        }
    }

    private Game resolveGame(String joinCode, UUID gameId) {
        if (joinCode != null && !joinCode.isBlank()) {
            return teamRepository.findByJoinCode(joinCode.trim())
                    .map(Team::getGame)
                    .orElseThrow(() -> new BadRequestException("Invalid join code"));
        }
        if (gameId != null) {
            return gameRepository.findById(gameId)
                    .orElseThrow(() -> new BadRequestException("Game not found"));
        }
        throw new BadRequestException("A join code or game is required");
    }
}
