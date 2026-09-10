package com.prayer.pointfinder.service.jobs;

import com.prayer.pointfinder.config.HaProperties;
import com.prayer.pointfinder.realtime.RealtimeOutboxRepository;
import com.prayer.pointfinder.service.ChunkedUploadService;
import com.prayer.pointfinder.service.GameSchedulerService;
import com.prayer.pointfinder.service.ratelimit.RateLimitStore;
import com.prayer.pointfinder.websocket.OperatorPresenceMaintenance;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

/**
 * Every cross-instance scheduled job enters here and runs through
 * {@link ScheduledJobCoordinator}, so at most one instance executes a job at
 * a time and the last outcome is recorded in {@code scheduled_job_leases}.
 *
 * <p>Jobs that are per instance by nature (mobile hub session sweep, presence
 * heartbeat, outbox poll) keep their own triggers and run everywhere.
 *
 * <p>The billing sweeper in {@code SubscriptionLifecycleService} keeps its own
 * {@code @Scheduled} trigger; {@link BillingSchedulerCoordinationAspect}
 * routes that invocation through the same coordinator without touching the
 * billing source.
 *
 * <p>Lease lengths are generous multiples of the expected runtime and double
 * as the job transaction's timeout. A lease that expires during a stall lets
 * the other instance claim it, but the advisory lock held by the still-running
 * transaction makes that claimant skip; every job body is idempotent on top.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ScheduledJobs {

    public static final String EXPIRE_PRACTICE_GAMES = "games.expirePracticeGames";
    public static final String AUTO_END_GAMES = "games.autoEnd";
    public static final String ACTIVATE_STAGES = "stages.activateScheduled";
    public static final String PURGE_REFRESH_TOKENS = "auth.purgeRefreshTokens";
    public static final String PURGE_PASSWORD_RESET_TOKENS = "auth.purgePasswordResetTokens";
    public static final String PURGE_EMAIL_CHANGE_TOKENS = "auth.purgeEmailChangeTokens";
    public static final String EXPIRE_UPLOAD_SESSIONS = "uploads.expireStaleSessions";
    public static final String DETECT_NEEDS_ATTENTION_UPLOADS = "uploads.detectNeedsAttention";
    public static final String SWEEP_ORPHAN_CHUNKS = "uploads.sweepOrphanChunks";
    public static final String CLEANUP_RATE_LIMITS = "rateLimits.cleanup";
    public static final String EXPIRE_PRESENCE = "presence.expireStale";
    public static final String CLEANUP_OUTBOX = "outbox.cleanup";

    private static final int CLEANUP_BATCH = 5000;

    private final ScheduledJobCoordinator coordinator;
    private final GameSchedulerService gameSchedulerService;
    private final ChunkedUploadService chunkedUploadService;
    private final RateLimitStore rateLimitStore;
    private final OperatorPresenceMaintenance presenceMaintenance;
    private final RealtimeOutboxRepository outboxRepository;
    private final HaProperties haProperties;

    @Scheduled(fixedRate = 60000)
    public void expirePracticeGames() {
        coordinator.run(EXPIRE_PRACTICE_GAMES, Duration.ofSeconds(60), gameSchedulerService::expirePracticeGames);
    }

    @Scheduled(fixedRate = 60000)
    public void autoEndGames() {
        coordinator.run(AUTO_END_GAMES, Duration.ofSeconds(60), gameSchedulerService::autoEndGames);
    }

    @Scheduled(fixedRate = 30000)
    public void activateScheduledStages() {
        coordinator.run(ACTIVATE_STAGES, Duration.ofSeconds(60), gameSchedulerService::activateScheduledStages);
    }

    @Scheduled(fixedRate = 3600000)
    public void purgeExpiredRefreshTokens() {
        coordinator.run(PURGE_REFRESH_TOKENS, Duration.ofMinutes(5), gameSchedulerService::purgeExpiredRefreshTokens);
    }

    @Scheduled(fixedRate = 3600000)
    public void purgeExpiredPasswordResetTokens() {
        coordinator.run(PURGE_PASSWORD_RESET_TOKENS, Duration.ofMinutes(5), gameSchedulerService::purgeExpiredPasswordResetTokens);
    }

    @Scheduled(fixedRate = 3600000)
    public void purgeExpiredEmailChangeTokens() {
        coordinator.run(PURGE_EMAIL_CHANGE_TOKENS, Duration.ofMinutes(5), gameSchedulerService::purgeExpiredEmailChangeTokens);
    }

    @Scheduled(fixedRate = 900000)
    public void expireStaleChunkUploadSessions() {
        coordinator.run(EXPIRE_UPLOAD_SESSIONS, Duration.ofMinutes(5), gameSchedulerService::expireStaleChunkUploadSessions);
    }

    @Scheduled(fixedRate = 900000)
    public void detectNeedsAttentionUploads() {
        coordinator.run(DETECT_NEEDS_ATTENTION_UPLOADS, Duration.ofMinutes(5), gameSchedulerService::detectNeedsAttentionUploads);
    }

    @Scheduled(fixedRate = 3600000)
    public void sweepOrphanChunkStorage() {
        coordinator.run(SWEEP_ORPHAN_CHUNKS, Duration.ofMinutes(10), () -> {
            int removed = chunkedUploadService.sweepOrphanChunkStorage();
            if (removed > 0) {
                log.info("Removed chunk storage for {} orphaned upload session(s)", removed);
            }
        });
    }

    @Scheduled(fixedRate = 5 * 60 * 1000)
    public void cleanupRateLimitBuckets() {
        coordinator.run(CLEANUP_RATE_LIMITS, Duration.ofMinutes(2), () -> {
            Instant olderThan = Instant.now().minus(Duration.ofHours(haProperties.getRateLimit().getRetentionHours()));
            int deleted = rateLimitStore.deleteStale(olderThan, CLEANUP_BATCH);
            if (deleted > 0) {
                log.info("Deleted {} stale rate-limit bucket(s)", deleted);
            }
        });
    }

    @Scheduled(fixedRateString = "${app.ha.presence.heartbeat-interval-ms:15000}")
    public void expireStalePresence() {
        coordinator.run(EXPIRE_PRESENCE, Duration.ofSeconds(30), presenceMaintenance::expireStaleSessions);
    }

    @Scheduled(fixedRate = 60000)
    public void cleanupOutbox() {
        coordinator.run(CLEANUP_OUTBOX, Duration.ofMinutes(2), () -> {
            HaProperties.Outbox outbox = haProperties.getOutbox();
            // Rows live for retention plus a grace period: a consumer dead-letters
            // a failing row once it passes retention, and the grace period keeps
            // the row around until every consumer had the chance to do so.
            int deleted = outboxRepository.deleteOlderThan(outbox.cleanupEdge(Instant.now()), CLEANUP_BATCH);
            int cursors = outboxRepository.deleteCursorsOlderThan(
                    Instant.now().minus(Duration.ofHours(outbox.getCursorRetentionHours())));
            // Dead letters are kept for inspection far longer than events; bounded all the same.
            outboxRepository.deleteDeadLettersOlderThan(Instant.now().minus(Duration.ofDays(30)));
            if (deleted > 0 || cursors > 0) {
                log.debug("Outbox cleanup: {} event row(s), {} cursor row(s)", deleted, cursors);
            }
        });
    }
}
