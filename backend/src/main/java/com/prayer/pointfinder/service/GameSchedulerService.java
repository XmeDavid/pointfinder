package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.UploadSession;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.PasswordResetTokenRepository;
import com.prayer.pointfinder.repository.RefreshTokenRepository;
import com.prayer.pointfinder.repository.UploadSessionRepository;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class GameSchedulerService {

    private final GameRepository gameRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final ChunkedUploadService chunkedUploadService;
    private final UploadSessionRepository uploadSessionRepository;
    private final GameEventBroadcaster eventBroadcaster;
    private final MeterRegistry meterRegistry;

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
     * Registered here so the Wave D stalled-active scheduler has a property to
     * read. Default 2 minutes. This property is intentionally not consumed by any
     * scheduler yet — adding a setter-ready field now avoids a second restart in
     * Wave D. See docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md.
     */
    @SuppressWarnings("unused") // wired in Wave D
    @Value("${app.uploads.stalled-threshold-minutes:2}")
    private long stalledThresholdMinutes;

    /**
     * Runs every 60 seconds to check for live games that have passed their end date
     * and automatically transitions them to ended.
     */
    @Scheduled(fixedRate = 60000)
    @Transactional(timeout = 10)
    public void autoEndGames() {
        List<Game> expiredGames = gameRepository.findByStatusAndEndDateBefore(
                GameStatus.live, Instant.now());

        for (Game game : expiredGames) {
            log.info("Auto-ending game '{}' (id={}) - end date {} has passed",
                    game.getName(), game.getId(), game.getEndDate());
            game.setStatus(GameStatus.ended);
            gameRepository.save(game);
            eventBroadcaster.broadcastGameStatus(game.getId(), GameStatus.ended.name());
        }
    }

    /**
     * Runs every hour to purge expired refresh tokens from the database.
     */
    @Scheduled(fixedRate = 3600000)
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
    @Scheduled(fixedRate = 3600000)
    @Transactional(timeout = 10)
    public void purgeExpiredPasswordResetTokens() {
        int deleted = passwordResetTokenRepository.deleteExpiredOrUsed(Instant.now());
        if (deleted > 0) {
            log.info("Purged {} expired/used password reset tokens", deleted);
        }
    }

    /**
     * Runs every 15 minutes to expire stale chunk upload sessions and clean temporary chunk files.
     */
    @Scheduled(fixedRate = 900000)
    @Transactional(timeout = 10)
    public void expireStaleChunkUploadSessions() {
        int expired = chunkedUploadService.expireStaleSessions();
        if (expired > 0) {
            log.info("Expired {} stale chunk upload sessions", expired);
        }
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
    @Scheduled(fixedRate = 900000)
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
}
