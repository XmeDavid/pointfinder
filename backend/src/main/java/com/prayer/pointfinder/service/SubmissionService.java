package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateSubmissionRequest;
import com.prayer.pointfinder.dto.request.MarkCompletedRequest;
import com.prayer.pointfinder.dto.request.ReviewSubmissionRequest;
import com.prayer.pointfinder.dto.response.SubmissionResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ConflictException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.exception.ForbiddenException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.*;
import com.prayer.pointfinder.security.SecurityUtils;
import com.prayer.pointfinder.util.LazyInitHelper;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import org.springframework.data.domain.PageRequest;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@Slf4j
@RequiredArgsConstructor
public class SubmissionService {

    private final SubmissionRepository submissionRepository;
    private final GameRepository gameRepository;
    private final TeamRepository teamRepository;
    private final ChallengeRepository challengeRepository;
    private final BaseRepository baseRepository;
    private final UserRepository userRepository;
    private final ActivityEventRepository activityEventRepository;
    private final CheckInRepository checkInRepository;
    private final GameEventBroadcaster eventBroadcaster;
    private final GameAccessService gameAccessService;
    private final FileStorageService fileStorageService;
    private final PlayerRepository playerRepository;
    private final OperatorPushNotificationService operatorPushNotificationService;
    private final TemplateVariableService templateVariableService;
    private final ThumbnailService thumbnailService;
    private final MonitoringService monitoringService;

    @org.springframework.beans.factory.annotation.Value("${app.uploads.path:/uploads}")
    private String uploadsPath;

    @Transactional(readOnly = true)
    public List<SubmissionResponse> getSubmissionsByGame(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return submissionRepository.findByGameId(gameId, PageRequest.of(0, 500)).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<SubmissionResponse> getSubmissionsByTeam(UUID gameId, UUID teamId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Team team = teamRepository.findById(teamId)
                .orElseThrow(() -> new ResourceNotFoundException("Team", teamId));
        if (!team.getGame().getId().equals(gameId)) {
            throw new BadRequestException("Team does not belong to this game");
        }
        return submissionRepository.findByTeamId(teamId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(timeout = 10)
    public SubmissionResponse createSubmission(UUID gameId, CreateSubmissionRequest request) {
        // The authorization helper returns the resolved Player when the
        // caller is player-authenticated, or null when the caller is an
        // operator. Capturing it here means V36 audit population does not
        // need a second {@code playerRepository.findById} round-trip.
        Player submittingPlayer = ensureCallerCanCreateSubmission(gameId, request.getTeamId());

        // Verify game is in live status before accepting submissions
        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new ResourceNotFoundException("Game", gameId));
        if (game.getStatus() != GameStatus.live) {
            throw new BadRequestException("Submissions can only be created when the game is live. Current status: " + game.getStatus());
        }

        // Check for idempotency - if submission with this key exists, return it
        if (request.getIdempotencyKey() != null) {
            var existing = submissionRepository.findByIdempotencyKey(request.getIdempotencyKey());
            if (existing.isPresent()) {
                Submission sub = existing.get();
                ensureBelongsToGame(sub.getTeam().getGame().getId(), gameId, "Submission");
                // Initialize lazy proxies before returning
                sub.getTeam().getId();
                sub.getChallenge().getId();
                sub.getBase().getId();
                return toResponse(sub);
            }
        }

        // Validate and normalize file URLs.
        // Support both legacy single fileUrl and new fileUrls list.
        List<String> validatedFileUrls = validateAndNormalizeFileUrls(request, gameId);
        request.setFileUrl(validatedFileUrls != null && !validatedFileUrls.isEmpty() ? validatedFileUrls.get(0) : null);
        request.setFileUrls(validatedFileUrls);

        Team team = teamRepository.findById(request.getTeamId())
                .orElseThrow(() -> new ResourceNotFoundException("Team", request.getTeamId()));
        Challenge challenge = challengeRepository.findById(request.getChallengeId())
                .orElseThrow(() -> new ResourceNotFoundException("Challenge", request.getChallengeId()));
        Base base = baseRepository.findById(request.getBaseId())
                .orElseThrow(() -> new ResourceNotFoundException("Base", request.getBaseId()));
        ensureBelongsToGame(team.getGame().getId(), gameId, "Team");
        ensureBelongsToGame(challenge.getGame().getId(), gameId, "Challenge");
        ensureBelongsToGame(base.getGame().getId(), gameId, "Base");

        // Force initialization of lazy proxies within this transaction
        team.getName();
        team.getGame().getId();
        challenge.getTitle();
        base.getName();

        // Determine initial status
        SubmissionStatus status = SubmissionStatus.pending;
        if (challenge.getAnswerType() == AnswerType.none) {
            // "None" challenges auto-approve immediately (check-in only)
            status = SubmissionStatus.approved;
        } else if (challenge.getAutoValidate() && challenge.getAnswerType() == AnswerType.text
                && challenge.getCorrectAnswer() != null && !challenge.getCorrectAnswer().isEmpty()) {
            String providedAnswer = request.getAnswer() != null ? request.getAnswer().trim() : "";
            // Resolve {{variables}} in correct answers for this team
            java.util.List<String> resolvedAnswers = templateVariableService.resolveTemplates(
                    challenge.getCorrectAnswer(), gameId, challenge.getId(), team.getId());
            boolean matches = resolvedAnswers.stream()
                    .anyMatch(ans -> ans.trim().equalsIgnoreCase(providedAnswer));
            status = matches ? SubmissionStatus.correct : SubmissionStatus.rejected;
        }

        // Award points immediately for auto-resolved submissions
        Integer points = (status == SubmissionStatus.approved || status == SubmissionStatus.correct)
                ? challenge.getPoints() : null;

        // Guard against duplicate auto-approved submissions when no idempotency key is provided.
        // Without this check, a client retry without an idempotency key would create duplicate
        // submissions and award points multiple times (finding 7.2).
        UUID idempotencyKey = request.getIdempotencyKey();
        if (idempotencyKey == null) {
            if (status == SubmissionStatus.approved || status == SubmissionStatus.correct) {
                List<Submission> existing = submissionRepository.findByTeamIdAndChallengeIdAndBaseId(
                        request.getTeamId(), request.getChallengeId(), request.getBaseId());
                if (!existing.isEmpty()) {
                    Submission sub = existing.get(0);
                    sub.getTeam().getId();
                    sub.getChallenge().getId();
                    sub.getBase().getId();
                    return toResponse(sub);
                }
            }
            idempotencyKey = java.util.UUID.randomUUID();
        }

        Submission submission = Submission.builder()
                .team(team)
                .challenge(challenge)
                .base(base)
                .answer(request.getAnswer() != null ? request.getAnswer() : "")
                .fileUrl(request.getFileUrl())
                .fileUrls(request.getFileUrls())
                .status(status)
                .points(points)
                .submittedAt(Instant.now())
                .idempotencyKey(idempotencyKey)
                // ── V36 audit foundation snapshot ─────────────────────────
                // Player-initiated submissions get the player FK plus
                // immutable display-name and device-id snapshots so the
                // audit survives later player removal. Operator-initiated
                // submissions (Phase 2 mark-completed) leave these NULL —
                // the synthetic-creator path will populate the
                // created_by_operator_* fields directly.
                .submittedByPlayer(submittingPlayer)
                .submittedByDisplayNameSnapshot(submittingPlayer != null ? submittingPlayer.getDisplayName() : null)
                .submittedByDeviceIdSnapshot(submittingPlayer != null ? submittingPlayer.getDeviceId() : null)
                .sourceSurface(submittingPlayer != null ? "player_app" : "web_admin")
                .build();

        try {
            submission = submissionRepository.save(submission);
        } catch (DataIntegrityViolationException ex) {
            // Race-safe idempotency: return existing submission if another request created it first.
            if (request.getIdempotencyKey() != null) {
                var existing = submissionRepository.findByIdempotencyKey(request.getIdempotencyKey());
                if (existing.isPresent()) {
                    Submission sub = existing.get();
                    ensureBelongsToGame(sub.getTeam().getGame().getId(), gameId, "Submission");
                    sub.getTeam().getId();
                    sub.getChallenge().getId();
                    sub.getBase().getId();
                    return toResponse(sub);
                }
            }
            throw ex;
        }

        // Create activity event with actor capture (V36).
        ActivityEvent event = ActivityEvent.builder()
                .game(team.getGame())
                .type(ActivityEventType.submission)
                .team(team)
                .base(base)
                .challenge(challenge)
                .message(team.getName() + " submitted answer for " + challenge.getTitle())
                .timestamp(Instant.now())
                .actorPlayer(submittingPlayer)
                .actorDisplayNameSnapshot(submittingPlayer != null ? submittingPlayer.getDisplayName() : null)
                .actorDeviceIdSnapshot(submittingPlayer != null ? submittingPlayer.getDeviceId() : null)
                .sourceSurface(submittingPlayer != null ? "player_app" : "web_admin")
                .build();
        activityEventRepository.save(event);

        LazyInitHelper.initializeForBroadcast(event);

        // Broadcast via WebSocket
        eventBroadcaster.broadcastActivityEvent(gameId, event);
        eventBroadcaster.broadcastSubmissionStatus(gameId, submission);
        operatorPushNotificationService.notifyOperatorsForSubmission(submission);

        // Generate thumbnails asynchronously after commit
        List<String> allFileUrls = submission.getFileUrls();
        if (uploadsPath != null && allFileUrls != null && !allFileUrls.isEmpty()
                && org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive()) {
            java.nio.file.Path gameDir = java.nio.file.Paths.get(uploadsPath).resolve(gameId.toString());
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                    new org.springframework.transaction.support.TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            thumbnailService.generateThumbnailsAsync(gameDir, allFileUrls);
                        }
                    });
        }

        return toResponse(submission);
    }

    @Transactional(timeout = 10)
    public SubmissionResponse reviewSubmission(UUID gameId, UUID submissionId, ReviewSubmissionRequest request) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Submission submission = submissionRepository.findById(submissionId)
                .orElseThrow(() -> new ResourceNotFoundException("Submission", submissionId));
        ensureBelongsToGame(submission.getTeam().getGame().getId(), gameId, "Submission");

        // Force initialization of lazy proxies within this transaction
        submission.getTeam().getName();
        submission.getTeam().getGame().getId();
        submission.getBase().getName();
        submission.getChallenge().getTitle();

        SubmissionStatus newStatus = SubmissionStatus.valueOf(request.getStatus().name());

        User currentUser = SecurityUtils.getCurrentUser();
        // Re-fetch user within transaction to get fresh entity with proper session
        UUID userId = currentUser.getId();
        currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        submission.setStatus(newStatus);
        submission.setReviewedBy(currentUser);
        submission.setFeedback(request.getFeedback());

        if (newStatus == SubmissionStatus.approved) {
            if (request.getPoints() != null) {
                submission.setPoints(request.getPoints());
            } else if (submission.getPoints() == null) {
                submission.setPoints(submission.getChallenge().getPoints());
            }
        }

        try {
            submission = submissionRepository.save(submission);
        } catch (ObjectOptimisticLockingFailureException ex) {
            throw new ConflictException(
                    "This submission was already reviewed by another operator. Please refresh.");
        }

        // Create activity event for the review
        ActivityEventType eventType = newStatus == SubmissionStatus.approved
                ? ActivityEventType.approval : ActivityEventType.rejection;
        String action = newStatus == SubmissionStatus.approved ? "approved" : "rejected";

        // V36 audit foundation: capture which operator approved/rejected the
        // submission. The reviewedBy column on Submission already records
        // this on the row itself; we additionally surface it on the
        // activity feed so the chronological audit log can answer
        // "who reviewed this?" without joining back to submissions.
        String operatorDisplayName = currentUser.getName() != null && !currentUser.getName().isBlank()
                ? currentUser.getName()
                : currentUser.getEmail();
        ActivityEvent event = ActivityEvent.builder()
                .game(submission.getTeam().getGame())
                .type(eventType)
                .team(submission.getTeam())
                .base(submission.getBase())
                .challenge(submission.getChallenge())
                .message(submission.getTeam().getName() + "'s submission for "
                        + submission.getChallenge().getTitle() + " was " + action)
                .timestamp(Instant.now())
                .actorOperatorUser(currentUser)
                .actorDisplayNameSnapshot(operatorDisplayName)
                .sourceSurface("web_admin")
                .build();
        activityEventRepository.save(event);

        LazyInitHelper.initializeForBroadcast(event);

        eventBroadcaster.broadcastActivityEvent(gameId, event);
        eventBroadcaster.broadcastSubmissionStatus(gameId, submission);
        eventBroadcaster.broadcastLeaderboardUpdate(gameId, monitoringService.computeLeaderboard(gameId));

        return toResponse(submission);
    }

    // ── P1 Phase 2: Operator "mark completed" rescue ───────────────────

    /**
     * Synthesizes an APPROVED submission on the operator's behalf, used
     * when a team physically completed a task but the app got stuck
     * (broken NFC read, uploader crashed, connectivity gap at review time,
     * etc.). The resulting row carries the V36 audit foundation fields so
     * the operator action is distinguishable from an organic submission
     * in the activity export.
     *
     * <p><strong>Preconditions:</strong>
     * <ul>
     *   <li>Caller is an operator with access to the game.</li>
     *   <li>Team belongs to the game, base belongs to the game, challenge
     *       belongs to the game.</li>
     *   <li>Team has an ACTIVE check-in at the base. The check-in is the
     *       gameplay anchor; if missing, the operator should call the
     *       manual check-in endpoint first. Surfaced as a 400 with
     *       {@code MARK_COMPLETED_REQUIRES_CHECKIN}.</li>
     * </ul>
     *
     * <p><strong>Idempotency:</strong> A deterministic
     * {@code UUID.nameUUIDFromBytes} key derived from
     * {@code (operatorId, teamId, baseId, challengeId)} is written to
     * {@code submissions.idempotency_key}. Re-calling the endpoint for the
     * same operator+team+base+challenge returns the existing row without
     * creating a duplicate or awarding extra points.
     *
     * <p><strong>Audit capture:</strong> the new submission sets
     * {@code created_by_operator_id}, {@code created_by_display_name_snapshot},
     * {@code operator_reason}, and {@code source_surface = "operator_rescue"}.
     * A companion {@link ActivityEventType#operator_override} event is
     * emitted with the same actor snapshot.
     *
     * <p><strong>Broadcasts:</strong> the normal {@code submission_status}
     * + {@code leaderboard} + {@code activity} events are emitted via
     * {@link GameEventBroadcaster}, which bumps {@code state_version}, so
     * player clients will reconcile on next snapshot fetch.
     */
    @Transactional(timeout = 10)
    public SubmissionResponse markCompletedByOperator(
            UUID gameId, UUID teamId, UUID baseId, MarkCompletedRequest request) {

        // Access check: only operators with access to the game can call
        // this path. Players cannot mark anything completed.
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);

        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new ResourceNotFoundException("Game", gameId));

        Team team = teamRepository.findById(teamId)
                .orElseThrow(() -> new ResourceNotFoundException("Team", teamId));
        ensureBelongsToGame(team.getGame().getId(), gameId, "Team");

        Base base = baseRepository.findById(baseId)
                .orElseThrow(() -> new ResourceNotFoundException("Base", baseId));
        ensureBelongsToGame(base.getGame().getId(), gameId, "Base");

        UUID challengeId = request.getChallengeId();
        if (challengeId == null) {
            throw new BadRequestException("challengeId is required");
        }
        Challenge challenge = challengeRepository.findById(challengeId)
                .orElseThrow(() -> new ResourceNotFoundException("Challenge", challengeId));
        ensureBelongsToGame(challenge.getGame().getId(), gameId, "Challenge");

        // Force initialization of lazy proxies so the broadcast helpers do
        // not hit a LazyInitializationException after the transaction.
        team.getName();
        challenge.getTitle();
        base.getName();
        game.getId();

        // Gameplay anchor: the team must be checked in at the base. This
        // keeps the progress model honest — "mark completed" is a rescue
        // on top of a recorded presence, not a pure state edit.
        if (!checkInRepository.existsByTeamIdAndBaseId(teamId, baseId)) {
            throw new BadRequestException(
                    "Team is not checked in at this base. "
                            + "Call the manual check-in endpoint first if needed.",
                    ErrorCode.MARK_COMPLETED_REQUIRES_CHECKIN);
        }

        // Resolve the operator inside the transaction so the persisted
        // entity is attached to the current session. Re-fetching from the
        // repo (rather than trusting the security principal directly)
        // protects against a stale copy in the security context polluting
        // the audit snapshot.
        User currentOperator = SecurityUtils.getCurrentUser();
        UUID operatorId = currentOperator.getId();
        User operator = userRepository.findById(operatorId)
                .orElseThrow(() -> new ResourceNotFoundException("User", operatorId));
        String operatorDisplayName = operator.getName() != null && !operator.getName().isBlank()
                ? operator.getName()
                : operator.getEmail();

        log.info("[OP] operation=markCompleted gameId={} teamId={} baseId={} challengeId={} operatorId={} reasonLength={} pointsOverride={}",
                gameId, teamId, baseId, challengeId, operatorId,
                request.getReason() != null ? request.getReason().length() : 0,
                request.getPointsOverride() != null);

        // Deterministic idempotency key derived from the natural tuple.
        // This makes re-clicking the rescue button return the existing row
        // instead of creating a duplicate or awarding extra points.
        UUID idempotencyKey = deriveMarkCompletedIdempotencyKey(
                operatorId, teamId, baseId, challengeId);

        Optional<Submission> existing = submissionRepository.findByIdempotencyKey(idempotencyKey);
        if (existing.isPresent()) {
            Submission sub = existing.get();
            // Touch lazy proxies before returning.
            sub.getTeam().getId();
            sub.getChallenge().getId();
            sub.getBase().getId();
            return toResponse(sub);
        }

        Integer points = request.getPointsOverride() != null
                ? request.getPointsOverride()
                : challenge.getPoints();

        Submission submission = Submission.builder()
                .team(team)
                .challenge(challenge)
                .base(base)
                .answer("[Operator marked complete]")
                .status(SubmissionStatus.approved)
                .submittedAt(Instant.now())
                .reviewedBy(operator)
                .points(points)
                .idempotencyKey(idempotencyKey)
                // ── V36 audit foundation: operator-created ─────────────
                .createdByOperator(operator)
                .createdByDisplayNameSnapshot(operatorDisplayName)
                .operatorReason(request.getReason())
                .sourceSurface("operator_rescue")
                .build();

        try {
            submission = submissionRepository.save(submission);
        } catch (DataIntegrityViolationException ex) {
            // Race-safe idempotency: if another operator raced us on the
            // same tuple, return the winning row.
            Optional<Submission> winner = submissionRepository.findByIdempotencyKey(idempotencyKey);
            if (winner.isPresent()) {
                Submission sub = winner.get();
                sub.getTeam().getId();
                sub.getChallenge().getId();
                sub.getBase().getId();
                return toResponse(sub);
            }
            throw ex;
        }

        // ── Activity event: operator_override (V36 enum value) ──────────
        String reasonSuffix = request.getReason() != null && !request.getReason().isBlank()
                ? ": " + request.getReason()
                : "";
        ActivityEvent event = ActivityEvent.builder()
                .game(game)
                .type(ActivityEventType.operator_override)
                .team(team)
                .base(base)
                .challenge(challenge)
                .message(operatorDisplayName + " marked " + challenge.getTitle()
                        + " complete for " + team.getName() + " at " + base.getName() + reasonSuffix)
                .timestamp(Instant.now())
                .actorOperatorUser(operator)
                .actorDisplayNameSnapshot(operatorDisplayName)
                .sourceSurface("operator_rescue")
                .build();
        activityEventRepository.save(event);

        LazyInitHelper.initializeForBroadcast(event);

        // Broadcasts auto-bump state_version so player snapshots see the
        // corrected state on next foreground/reconnect without any push.
        eventBroadcaster.broadcastActivityEvent(gameId, event);
        eventBroadcaster.broadcastSubmissionStatus(gameId, submission);
        eventBroadcaster.broadcastLeaderboardUpdate(gameId, monitoringService.computeLeaderboard(gameId));

        return toResponse(submission);
    }

    /**
     * Derives the deterministic idempotency key for a mark-completed
     * action from the {@code (operatorId, teamId, baseId, challengeId)}
     * tuple. Using {@link UUID#nameUUIDFromBytes(byte[])} avoids a
     * round-trip to the database to pre-check existence: the caller can
     * compute the key and do a single INSERT, with the partial unique
     * index on {@code submissions.idempotency_key} enforcing race safety.
     *
     * <p>Package-private for direct unit-test coverage.
     */
    static UUID deriveMarkCompletedIdempotencyKey(
            UUID operatorId, UUID teamId, UUID baseId, UUID challengeId) {
        String seed = "mark-completed|" + operatorId + "|" + teamId + "|" + baseId + "|" + challengeId;
        return UUID.nameUUIDFromBytes(seed.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * Authorizes the current caller to create a submission for the given
     * team and returns the resolved {@link Player} when the caller is
     * player-authenticated, or {@code null} when the caller is an operator.
     *
     * <p>Returning the Player here is intentional: V36 audit capture
     * populates the {@code submitted_by_*} snapshot fields from the same
     * managed entity instead of doing a second
     * {@code playerRepository.findById} round-trip in
     * {@code createSubmission}.
     */
    private Player ensureCallerCanCreateSubmission(UUID gameId, UUID teamId) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            throw new ForbiddenException("Authentication is required");
        }

        Object principal = auth.getPrincipal();
        if (principal instanceof User) {
            gameAccessService.ensureCurrentUserCanAccessGame(gameId);
            return null;
        }

        if (principal instanceof Player player) {
            Player managedPlayer = playerRepository.findById(player.getId())
                    .orElseThrow(() -> new ResourceNotFoundException("Player", player.getId()));
            gameAccessService.ensurePlayerBelongsToGame(managedPlayer, gameId);
            if (!managedPlayer.getTeam().getId().equals(teamId)) {
                throw new ForbiddenException("Player cannot create submissions for another team");
            }
            return managedPlayer;
        }

        throw new ForbiddenException("Unauthorized principal for submission creation");
    }

    private void ensureBelongsToGame(UUID entityGameId, UUID expectedGameId, String entityName) {
        gameAccessService.ensureBelongsToGame(entityName, entityGameId, expectedGameId);
    }

    private static final int MAX_FILES_PER_SUBMISSION = 5;

    private List<String> validateAndNormalizeFileUrls(CreateSubmissionRequest request, UUID gameId) {
        List<String> urls = request.getFileUrls();
        // Fall back to legacy single fileUrl if fileUrls not provided
        if (urls == null || urls.isEmpty()) {
            String single = fileStorageService.validateStoredFileUrl(request.getFileUrl(), gameId);
            return single != null ? List.of(single) : null;
        }
        if (urls.size() > MAX_FILES_PER_SUBMISSION) {
            throw new BadRequestException("Maximum " + MAX_FILES_PER_SUBMISSION + " files per submission");
        }
        return urls.stream()
                .map(url -> fileStorageService.validateStoredFileUrl(url, gameId))
                .filter(java.util.Objects::nonNull)
                .toList();
    }

    private SubmissionResponse toResponse(Submission s) {
        return SubmissionResponse.builder()
                .id(s.getId())
                .teamId(s.getTeam().getId())
                .challengeId(s.getChallenge().getId())
                .baseId(s.getBase().getId())
                .answer(s.getAnswer())
                .fileUrl(s.getFileUrl())
                .fileUrls(s.getFileUrls())
                .status(s.getStatus().name())
                .submittedAt(s.getSubmittedAt())
                .reviewedBy(s.getReviewedBy() != null ? s.getReviewedBy().getId() : null)
                .feedback(s.getFeedback())
                .points(s.getPoints())
                .completionContent(s.getChallenge().getCompletionContent())
                .build();
    }
}
