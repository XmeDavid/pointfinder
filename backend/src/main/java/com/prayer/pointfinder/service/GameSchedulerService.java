package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.repository.EmailChangeTokenRepository;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.PasswordResetTokenRepository;
import com.prayer.pointfinder.repository.RefreshTokenRepository;
import com.prayer.pointfinder.repository.StageRepository;
import com.prayer.pointfinder.repository.UploadSessionRepository;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class GameSchedulerService {

    // Triggers live in com.prayer.pointfinder.service.jobs.ScheduledJobs and run
    // through ScheduledJobCoordinator, so with two instances each job executes on
    // one of them per tick. The bodies below stay idempotent regardless: game and
    // stage transitions use conditional updates that change a row at most once.

    private final GameRepository gameRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final EmailChangeTokenRepository emailChangeTokenRepository;
    private final ChunkedUploadService chunkedUploadService;
    private final UploadSessionRepository uploadSessionRepository;
    private final StageRepository stageRepository;
    private final GameEventBroadcaster eventBroadcaster;
    private final MeterRegistry meterRegistry;
    private final com.prayer.pointfinder.xp.XpService xpService;
    private final jakarta.persistence.EntityManager entityManager;
    private final org.springframework.transaction.PlatformTransactionManager transactionManager;

    /**
     * How old a completed-but-unlinked upload session must be before the
     * needs-attention detector alerts on it. Default 15 minutes gives normal
     * submission retries a chance to link the upload without generating noise,
     * while still being short enough that an operator sees stuck media within
     * the same on-call window.
     */
    @Value("${app.uploads.needs-attention-threshold-minutes:15}")
    private long needsAttentionThresholdMinutes;

    /**
     * Ends practice games (tutorial games) that have reached their expiry, in
     * setup or live. Ended games keep their content and no longer count
     * anywhere, so a late "keep" still works.
     */
    public void expirePracticeGames() {
        Instant now = Instant.now();
        List<Game> expired = gameRepository.findByTutorialScenarioIsNotNullAndTutorialExpiresAtBeforeAndStatusNot(
                now, GameStatus.ended);
        for (Game candidate : expired) {
            endThroughFinalizer(candidate.getId(), game -> game.getStatus() != GameStatus.ended
                    && game.getTutorialScenario() != null && game.getTutorialExpiresAt() != null && game.getTutorialExpiresAt().isBefore(now),
                    "Ending expired practice game '{}' (id={}, expired {})");
        }
    }

    /**
     * Runs every 60 seconds to check for live games that have passed their end date
     * and automatically transitions them to ended.
     */
    /** Not transactional itself: every due game ends in its own transaction, so one big game cannot starve the rest. */
    public void autoEndGames() {
        Instant now = Instant.now();
        List<Game> expiredGames = gameRepository.findByStatusAndEndDateBefore(GameStatus.live, now);
        for (Game candidate : expiredGames) {
            endThroughFinalizer(candidate.getId(), game -> game.getStatus() == GameStatus.live
                    && game.getEndDate() != null && game.getEndDate().isBefore(now), "Auto-ending game '{}' (id={}) - end date {} has passed");
        }
    }

    /**
     * Every ending path finalizes XP the same way: lock the row, re-check that the
     * game is still due (another node may have ended it), end it, finalize, broadcast.
     */
    private void endThroughFinalizer(UUID gameId, java.util.function.Predicate<Game> stillDue, String logMessage) {
        org.springframework.transaction.support.TransactionTemplate perGame = new org.springframework.transaction.support.TransactionTemplate(transactionManager);
        perGame.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        perGame.setTimeout(30);
        perGame.executeWithoutResult(status -> endLocked(gameId, stillDue, logMessage));
    }

    private void endLocked(UUID gameId, java.util.function.Predicate<Game> stillDue, String logMessage) {
        Game game = gameRepository.findByIdForUpdate(gameId).orElse(null);
        if (game == null) return;
        // The candidate scan above already loaded this entity into the persistence
        // context; the locked query hands back that cached instance, so re-read the
        // row now that the lock is ours and another run may have ended it meanwhile.
        entityManager.refresh(game);
        if (!stillDue.test(game)) return;
        log.info(logMessage, game.getName(), game.getId(), game.getEndDate() != null ? game.getEndDate() : game.getTutorialExpiresAt());
        xpService.finalizeCycle(game);
        game.setStatus(GameStatus.ended);
        gameRepository.save(game);
        eventBroadcaster.broadcastGameStatus(game.getId(), GameStatus.ended.name());
    }

    /**
     * Runs every hour to purge expired refresh tokens from the database.
     */
    @Transactional(timeout = 10)
    public void purgeExpiredRefreshTokens() {
        int deleted = refreshTokenRepository.deleteExpiredBefore(Instant.now());
        if (deleted > 0) {
            log.info("Purged {} expired refresh tokens", deleted);
        }
    }

    /**
     * Runs every hour to purge expired or used password reset tokens from the database.
     */
    @Transactional(timeout = 10)
    public void purgeExpiredPasswordResetTokens() {
        int deleted = passwordResetTokenRepository.deleteExpiredOrUsed(Instant.now());
        if (deleted > 0) {
            log.info("Purged {} expired/used password reset tokens", deleted);
        }
    }

    /**
     * Runs every hour to purge expired or used email change tokens from the database.
     */
    @Transactional(timeout = 10)
    public void purgeExpiredEmailChangeTokens() {
        int emailTokensPurged = emailChangeTokenRepository.deleteExpiredOrUsed(Instant.now());
        if (emailTokensPurged > 0) {
            log.info("Purged {} expired/used email change tokens", emailTokensPurged);
        }
    }

    /**
     * Runs every 15 minutes to expire stale chunk upload sessions and clean temporary chunk files.
     */
    @Transactional(timeout = 10)
    public void expireStaleChunkUploadSessions() {
        expireStaleChunkUploadSessionsAndCount();
    }

    /** Same sweep, returning how many sessions this run expired. */
    @Transactional(timeout = 10)
    public int expireStaleChunkUploadSessionsAndCount() {
        int expired = chunkedUploadService.expireStaleSessions();
        if (expired > 0) {
            log.info("Expired {} stale chunk upload sessions", expired);
        }
        return expired;
    }

    /**
     * Runs every 15 minutes to surface completed upload sessions whose final
     * submission call never tied them to a submission record.
     *
     * <p><strong>ALERT-ONLY.</strong> This method MUST NOT modify, delete, or
     * fail any upload session or submission. Its only job is to make stuck
     * uploads visible to operators (via Micrometer counter and log) so the
     * player's work remains recoverable days or weeks later. A player can
     * always come back and retry the submission — the detector is just a
     * visibility signal, not a garbage collector.
     *
     * <p>Uses a read-only query. Runs in a separate transaction from
     * player-facing work so a slow scheduler tick never blocks the gameplay
     * path. Bounded to 500 rows per tick by the repository query.
     */
    @Transactional(readOnly = true, timeout = 30)
    public void detectNeedsAttentionUploads() {
        Instant now = Instant.now();
        Instant threshold = now.minus(Duration.ofMinutes(needsAttentionThresholdMinutes));
        List<UploadSession> stuck = uploadSessionRepository.findCompletedNeedsAttention(threshold);
        if (stuck.isEmpty()) {
            return;
        }
        for (UploadSession session : stuck) {
            Instant completedAt = session.getCompletedAt();
            long ageMinutes = completedAt == null
                    ? -1L
                    : Duration.between(completedAt, now).toMinutes();
            String gameId = session.getGame() != null && session.getGame().getId() != null
                    ? session.getGame().getId().toString()
                    : "unknown";
            meterRegistry.counter(
                    "uploads.sessions.needs_attention",
                    "gameId", gameId,
                    "reason", "completed_no_submission"
            ).increment();
            log.warn(
                    "Upload session needs attention: sessionId={} playerId={} gameId={} fileUrl={} completedAt={} ageMinutes={}",
                    session.getId(),
                    session.getPlayer() != null ? session.getPlayer().getId() : null,
                    gameId,
                    session.getFileUrl(),
                    completedAt,
                    ageMinutes
            );
        }
        log.info(
                "Needs-attention detector surfaced {} completed upload session(s) older than {} minutes",
                stuck.size(),
                needsAttentionThresholdMinutes
        );
    }

    /**
     * Runs every 30 seconds to activate stages whose scheduled transition time has arrived.
     * Finds stages with transitionType='scheduled', isActive=false, scheduledAt <= now,
     * sets them active, and broadcasts stage_unlock so players receive newly visible bases.
     */
    @Transactional(timeout = 10)
    public void activateScheduledStages() {
        OffsetDateTime now = OffsetDateTime.now();
        List<Stage> dueStages = stageRepository.findByTransitionTypeAndIsActiveAndScheduledAtBefore(
                TransitionType.scheduled, false, now);

        for (Stage stage : dueStages) {
            UUID gameId = stage.getGame().getId();
            if (stageRepository.activateIfScheduledAndDue(stage.getId(), now) != 1) {
                // Another run activated it first, or an operator rescheduled it
                // after the query above: either way this run must not announce it.
                continue;
            }

            log.info("[SCHEDULER] operation=activateScheduledStage gameId={} stageId={} name={} scheduledAt={}",
                    gameId, stage.getId(), stage.getName(), stage.getScheduledAt());

            eventBroadcaster.broadcastStageUnlock(gameId, stage.getId());
            eventBroadcaster.broadcastGameConfig(gameId, "stages", "activated");
        }
    }
}
