package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateGameRequest;
import com.prayer.pointfinder.dto.request.UpdateGameRequest;
import com.prayer.pointfinder.dto.response.GameResponse;
import com.prayer.pointfinder.dto.response.UserResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.entity.UnlockTrigger;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.exception.ForbiddenException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.mapper.GameResponseMapper;
import com.prayer.pointfinder.repository.*;
import com.prayer.pointfinder.security.SecurityUtils;
import com.prayer.pointfinder.util.CodeGenerator;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Core game lifecycle service: CRUD, status transitions, operator management.
 * Import/export logic is delegated to {@link GameImportExportService}.
 * Challenge assignment logic is delegated to {@link ChallengeAssignmentService}.
 * Go-live readiness checks are delegated to {@link GameReadinessValidator}.
 * Progress reset is delegated to {@link GameProgressResetService}.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class GameService {

    private final GameRepository gameRepository;
    private final UserRepository userRepository;
    private final GameAccessService gameAccessService;
    private final FileStorageService fileStorageService;
    private final GameEventBroadcaster eventBroadcaster;
    private final ChallengeAssignmentService challengeAssignmentService;
    private final GameProgressResetService gameProgressResetService;
    private final GameReadinessValidator gameReadinessValidator;
    private final QuotaService quotaService;
    private final UserTutorialProgressRepository progressRepository;
    private final OrganizationService organizationService;
    private final com.prayer.pointfinder.xp.XpService xpService;
    private final com.prayer.pointfinder.repository.SubmissionRepository submissionRepository;
    private final com.prayer.pointfinder.repository.TeamRepository teamRepository;
    private final com.prayer.pointfinder.repository.PlayerRepository playerRepository;

    // Public spectator broadcast codes are unauthenticated and expose live
    // team GPS, so they must resist enumeration. 10 chars over the 32-symbol
    // ambiguity-reduced alphabet (~1.13e15 combinations) makes brute-forcing
    // a valid code impractical. Existing 6-char codes remain valid (see V57).
    private static final int BROADCAST_CODE_LENGTH = 10;
    private static final java.util.Set<String> VALID_TILE_SOURCES = java.util.Set.of("osm", "osm-classic", "voyager", "positron", "swisstopo", "swisstopo-sat");
    private static final java.util.Set<String> VALID_UNLOCK_TRIGGERS = java.util.Set.of("CHECK_IN", "SUBMISSION", "COMPLETED");

    // ── Read ─────────────────────────────────────────────────────────

    /**
     * Lists one workspace at a time, mirroring the operator's workspace
     * switcher. {@code orgId} null means the personal workspace: games the
     * caller created or operates that belong to no organization. With an
     * {@code orgId} it is that organization's games, for members that may
     * operate them.
     */
    @Transactional(readOnly = true)
    public List<GameResponse> getAllGames(UUID orgId) {
        User currentUser = SecurityUtils.getCurrentUser();
        UUID userId = currentUser.getId();
        userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        List<Game> games;
        if (orgId == null) {
            games = gameRepository.findPersonalByOperatorOrCreator(userId);
        } else {
            organizationService.ensureCurrentUserHasPermission(orgId, OrgPermission.OPERATE_GAMES);
            games = gameRepository.findByOrganizationId(orgId);
        }
        return games.stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public GameResponse getGame(UUID id) {
        Game game = gameAccessService.getAccessibleGame(id);
        return toResponse(game);
    }

    @Transactional(readOnly = true)
    public List<UserResponse> getGameOperators(UUID gameId) {
        Game game = gameAccessService.getAccessibleGame(gameId);
        return game.getOperators().stream()
                .map(user -> UserResponse.builder()
                        .id(user.getId())
                        .email(user.getEmail())
                        .name(user.getName())
                        .role(user.getRole().name())
                        .createdAt(user.getCreatedAt())
                        .build())
                .toList();
    }

    // ── Create / Update / Delete ─────────────────────────────────────

    @Transactional(timeout = 10)
    public GameResponse createGame(CreateGameRequest request) {
        User currentUser = SecurityUtils.getCurrentUser();
        UUID userId = currentUser.getId();
        currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        // The first-game tutorial has the operator create their practice game
        // through this dialog. The flag is honoured only while that run is in
        // progress; anything else is a normal game under the normal quota.
        boolean practice = PracticeGames.isFirstGameRun(progressRepository, userId, request.getTutorialScenario());
        // A tutorial create is always personal: the request asked for a practice
        // game, so an orgId the dialog happened to carry is ignored rather
        // than parking a tutorial game in an organization. This holds even
        // when the run has since finished and this becomes a normal game.
        boolean tutorialCreate = request.getTutorialScenario() != null
                && !request.getTutorialScenario().isBlank();
        Organization organization = tutorialCreate ? null : resolveCreateOrg(request.getOrgId());
        if (practice) {
            PracticeGames.ensureNoActivePracticeGame(gameRepository, userId);
        } else if (organization == null) {
            // Org games live under the org's live-game limit, checked at
            // go-live; only personal games count against this one.
            quotaService.enforceActiveGameLimit(currentUser);
        }

        Game game = Game.builder()
                .name(request.getName())
                .description(request.getDescription() != null ? request.getDescription() : "")
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .uniformAssignment(request.getUniformAssignment() != null ? request.getUniformAssignment() : false)
                .enforceBaseOrder(Boolean.TRUE.equals(request.getEnforceBaseOrder()))
                .tileSource(validateTileSource(request.getTileSource()))
                .unlockTrigger(validateUnlockTrigger(request.getUnlockTrigger()))
                .defaultCheckInMethod(validateCheckInMethod(request.getDefaultCheckInMethod()))
                .defaultCheckInRadiusM(clampDefaultRadius(request.getDefaultCheckInRadiusM()))
                .status(GameStatus.setup)
                .createdBy(currentUser)
                .organization(organization)
                .tutorialScenario(practice ? PracticeGames.FIRST_GAME : null)
                .tutorialExpiresAt(practice ? PracticeGames.expiry() : null)
                .build();
        game.getOperators().add(currentUser);
        if (game.getDefaultCheckInMethod() == CheckInMethod.LOCATION) {
            quotaService.enforceLocationCheckIn(game);
        }

        try {
            game = gameRepository.saveAndFlush(game);
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            if (!practice) throw e;
            throw new com.prayer.pointfinder.exception.ConflictException(
                    "You already have a practice game; delete or keep it first",
                    ErrorCode.TUTORIAL_PRACTICE_GAME_EXISTS);
        }
        if (practice) {
            PracticeGames.bindProgressRow(progressRepository, userId, PracticeGames.FIRST_GAME, game.getId());
        }
        return toResponse(game);
    }

    @Transactional(timeout = 10)
    public GameResponse updateGame(UUID id, UpdateGameRequest request) {
        Game game = gameRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ResourceNotFoundException("Game", id));
        gameAccessService.ensureCurrentUserCanAccessGame(game);

        if (request.getEnforceBaseOrder() != null) {
            if (!request.getEnforceBaseOrder().equals(game.getEnforceBaseOrder())
                    && game.getStatus() != GameStatus.setup) {
                throw new BadRequestException("Base order can only be changed during setup",
                        com.prayer.pointfinder.exception.ErrorCode.BASE_ORDER_LOCKED);
            }
            game.setEnforceBaseOrder(request.getEnforceBaseOrder());
        }

        game.setName(request.getName());
        game.setDescription(request.getDescription() != null ? request.getDescription() : "");
        game.setStartDate(request.getStartDate());
        game.setEndDate(request.getEndDate());
        if (request.getUniformAssignment() != null) {
            game.setUniformAssignment(request.getUniformAssignment());
        }
        if (request.getTileSource() != null) {
            game.setTileSource(validateTileSource(request.getTileSource()));
        }
        if (request.getUnlockTrigger() != null) {
            game.setUnlockTrigger(validateUnlockTrigger(request.getUnlockTrigger()));
        }
        if (request.getDefaultCheckInMethod() != null) {
            CheckInMethod method = validateCheckInMethod(request.getDefaultCheckInMethod());
            if (method != game.getDefaultCheckInMethod() && game.getStatus() != GameStatus.setup) {
                throw new BadRequestException("Check-in settings can only be changed during setup");
            }
            if (method == CheckInMethod.LOCATION && method != game.getDefaultCheckInMethod()) {
                quotaService.enforceLocationCheckIn(game);
            }
            game.setDefaultCheckInMethod(method);
        }
        if (request.getDefaultCheckInRadiusM() != null) {
            Integer radius = clampDefaultRadius(request.getDefaultCheckInRadiusM());
            if (!radius.equals(game.getDefaultCheckInRadiusM()) && game.getStatus() != GameStatus.setup) {
                throw new BadRequestException("Check-in settings can only be changed during setup");
            }
            game.setDefaultCheckInRadiusM(radius);
        }
        if (request.getBroadcastEnabled() != null) {
            boolean wasEnabled = Boolean.TRUE.equals(game.getBroadcastEnabled());
            boolean nowEnabled = request.getBroadcastEnabled();
            if (nowEnabled && !wasEnabled) {
                game.setBroadcastEnabled(true);
                game.setBroadcastCode(generateBroadcastCode());
            } else if (!nowEnabled && wasEnabled) {
                game.setBroadcastEnabled(false);
                game.setBroadcastCode(null);
            }
        }

        game = gameRepository.save(game);
        eventBroadcaster.broadcastGameConfig(id, "game_settings", "updated");
        return toResponse(game);
    }

    @Transactional(timeout = 10)
    public void deleteGame(UUID id) {
        Game game = gameRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Game", id));
        gameAccessService.ensureCurrentUserCanAccessGame(game);
        if (game.getOrganization() != null) {
            organizationService.ensureCurrentUserHasPermission(
                    game.getOrganization().getId(), OrgPermission.DELETE_GAMES);
        }
        gameRepository.deleteById(id);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                try {
                    fileStorageService.deleteGameFiles(id);
                } catch (Exception e) {
                    log.warn("Failed to clean up files for deleted game {}: {}", id, e.getMessage());
                }
                eventBroadcaster.broadcastGameStatus(id, "ended");
            }
        });
    }

    // ── Status transitions ───────────────────────────────────────────

    @Transactional(timeout = 10)
    public GameResponse updateStatus(UUID id, String newStatus, boolean resetProgress) {
        // CRITICAL-2 fix: take a pessimistic write lock on the Game row before
        // running the readiness check. This prevents the race where Operator B
        // resets progress (deleteByGameId) between Operator A's readiness check
        // and Operator A's setStatus call, which would leave the game "live" with
        // 0 teams / 0 assignments. The lock is held for the duration of this
        // @Transactional method; any concurrent status transition waits at the DB.
        Game game = gameRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ResourceNotFoundException("Game", id));
        gameAccessService.ensureCurrentUserCanAccessGame(id);

        GameStatus target;
        try {
            target = GameStatus.valueOf(newStatus);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Invalid status: " + newStatus);
        }

        GameStatus fromStatus = game.getStatus();
        validateStatusTransition(fromStatus, target);
        // Bringing an ended personal game back counts against the active-game
        // quota like a creation would; practice games live outside it.
        if (fromStatus == GameStatus.ended && target != GameStatus.ended
                && game.getOrganization() == null && !game.isPracticeGame()) {
            quotaService.enforceActiveGameLimit(game.getCreatedBy());
        }

        User currentOperator = SecurityUtils.getCurrentUser();
        log.info("[OP] operation=advanceStatus gameId={} fromStatus={} toStatus={} operatorId={}",
                id, fromStatus, target, currentOperator.getId());

        // Reverting keeps the operator's plan: bases, challenges, teams and
        // assignments stay as they are, and only the progress the operator
        // chose to erase goes. Clearing assignments here used to leave a
        // location-bound challenge unassigned, which the readiness check then
        // rejected before the go-live auto-assign could ever refill it.
        if (target == GameStatus.setup && resetProgress) {
            gameProgressResetService.resetProgress(id);
            xpService.invalidateCycle(game);
        }

        if (target == GameStatus.live) {
            // An org game is bounded by the org plan's live-game limit rather
            // than the creator's personal active-game quota.
            if (game.getOrganization() != null) {
                quotaService.enforceOrgLiveGameLimit(game.getOrganization());
            }
            gameReadinessValidator.validateGoLivePrerequisites(game);

            if (game.getStartDate() == null) {
                game.setStartDate(Instant.now());
            }
            challengeAssignmentService.autoAssignChallenges(game);
            xpService.openCycle(game);
        }

        if (target == GameStatus.ended && fromStatus != GameStatus.ended) {
            // The one finalizer, under the row lock taken above. Every ending path uses it.
            xpService.finalizeCycle(game);
        }
        game.setStatus(target);
        game = gameRepository.save(game);
        eventBroadcaster.broadcastGameStatus(game.getId(), game.getStatus().name());
        return toResponse(game);
    }

    /** What the operator sees before ending: how many submissions are still unreviewed. */
    @Transactional(readOnly = true)
    public com.prayer.pointfinder.dto.response.EndSummaryResponse endSummary(UUID id) {
        gameAccessService.ensureCurrentUserCanAccessGame(id);
        Game game = gameRepository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Game", id));
        long pending = submissionRepository.countByGameIdAndStatus(id, com.prayer.pointfinder.entity.SubmissionStatus.pending);
        long teams = teamRepository.countByGameId(id);
        long players = playerRepository.countByGameId(id);
        return new com.prayer.pointfinder.dto.response.EndSummaryResponse(game.getStatus().name(), pending, teams, players);
    }

    // ── Operator management ──────────────────────────────────────────

    @Transactional(timeout = 10)
    public void addOperator(UUID gameId, UUID userId) {
        Game game = gameAccessService.getAccessibleGame(gameId);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        quotaService.enforceOperatorsPerGameLimit(game);
        game.getOperators().add(user);
        gameRepository.save(game);
    }

    @Transactional(timeout = 10)
    public void removeOperator(UUID gameId, UUID userId) {
        Game game = gameAccessService.getAccessibleGame(gameId);
        User currentUser = SecurityUtils.getCurrentUser();

        if (currentUser.getRole() != UserRole.admin
                && !game.getCreatedBy().getId().equals(currentUser.getId())) {
            throw new ForbiddenException("Only the game owner or an admin can remove operators");
        }

        if (game.getCreatedBy().getId().equals(userId)) {
            throw new BadRequestException("Cannot remove the game creator as operator");
        }
        game.getOperators().removeIf(u -> u.getId().equals(userId));
        gameRepository.save(game);
    }

    // ── Private helpers ──────────────────────────────────────────────

    /**
     * Resolves the target organization for a new game, rejecting a caller that
     * is not a member with {@code CREATE_GAMES}. Admins bypass, as everywhere.
     */
    private Organization resolveCreateOrg(UUID orgId) {
        if (orgId == null) return null;
        Organization org = organizationService.findOrgOrThrow(orgId);
        organizationService.ensureCurrentUserHasPermission(orgId, OrgPermission.CREATE_GAMES);
        return org;
    }

    private void validateStatusTransition(GameStatus current, GameStatus target) {
        if (current == target) {
            throw new BadRequestException("Game is already in " + current + " state");
        }
        if (!current.canTransitionTo(target)) {
            throw new BadRequestException("Cannot transition from " + current + " to " + target);
        }
    }

    private GameResponse toResponse(Game game) {
        return GameResponseMapper.toResponse(game, quotaService.effectiveLocationCheckInAllowed(game));
    }

    private String validateTileSource(String tileSource) {
        if (tileSource == null || tileSource.isBlank()) return "osm-classic";
        if (!VALID_TILE_SOURCES.contains(tileSource)) {
            throw new BadRequestException("Invalid tile source: " + tileSource + ". Valid values: " + VALID_TILE_SOURCES);
        }
        return tileSource;
    }

    /**
     * Null means "keep the product default of NFC", which is what an older
     * client that does not know about check-in methods will send.
     */
    private CheckInMethod validateCheckInMethod(String raw) {
        if (raw == null || raw.isBlank()) {
            return CheckInMethod.NFC;
        }
        try {
            return CheckInMethod.valueOf(raw.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new BadRequestException(
                    "Invalid check-in method: " + raw + ". Must be one of: NFC, QR, LOCATION");
        }
    }

    private Integer clampDefaultRadius(Integer raw) {
        return raw == null ? 15 : CheckInVerificationService.clampRadiusM(raw);
    }

    private UnlockTrigger validateUnlockTrigger(String unlockTrigger) {
        if (unlockTrigger == null) return UnlockTrigger.CHECK_IN;
        String upper = unlockTrigger.toUpperCase();
        if (!VALID_UNLOCK_TRIGGERS.contains(upper)) {
            throw new BadRequestException("Invalid unlock trigger: " + unlockTrigger + ". Must be one of: CHECK_IN, SUBMISSION, COMPLETED");
        }
        return UnlockTrigger.valueOf(upper);
    }

    private String generateBroadcastCode() {
        for (int attempt = 0; attempt < 10; attempt++) {
            String code = CodeGenerator.generate(BROADCAST_CODE_LENGTH);
            if (!gameRepository.findByBroadcastCodeAndBroadcastEnabledTrue(code).isPresent()) {
                if (attempt > 0) {
                    log.warn("Broadcast code generation required {} attempts before finding a unique code", attempt + 1);
                }
                return code;
            }
            log.debug("Broadcast code collision on attempt {}, retrying", attempt + 1);
        }
        log.error("Failed to generate unique broadcast code after 10 attempts");
        throw new IllegalStateException("Unable to generate unique broadcast code after 10 attempts");
    }
}
