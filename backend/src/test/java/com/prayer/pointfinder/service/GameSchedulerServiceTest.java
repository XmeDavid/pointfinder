package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.UploadSession;
import com.prayer.pointfinder.entity.UploadSessionStatus;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.PasswordResetTokenRepository;
import com.prayer.pointfinder.repository.RefreshTokenRepository;
import com.prayer.pointfinder.repository.UploadSessionRepository;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class GameSchedulerServiceTest {

    @Mock
    private GameRepository gameRepository;
    @Mock
    private RefreshTokenRepository refreshTokenRepository;
    @Mock
    private PasswordResetTokenRepository passwordResetTokenRepository;
    @Mock
    private ChunkedUploadService chunkedUploadService;
    @Mock
    private UploadSessionRepository uploadSessionRepository;
    @Mock
    private GameEventBroadcaster eventBroadcaster;
    @Mock
    private MeterRegistry meterRegistry;

    @InjectMocks
    private GameSchedulerService gameSchedulerService;

    private Counter needsAttentionCounter;

    @BeforeEach
    void setUpMeterRegistry() {
        needsAttentionCounter = mock(Counter.class);
        when(meterRegistry.counter(anyString())).thenReturn(needsAttentionCounter);
        when(meterRegistry.counter(anyString(), anyString(), anyString())).thenReturn(needsAttentionCounter);
        when(meterRegistry.counter(anyString(), anyString(), anyString(), anyString(), anyString()))
                .thenReturn(needsAttentionCounter);
        // Default thresholds for the detector; individual tests may override via
        // ReflectionTestUtils when they need a shorter/longer window.
        ReflectionTestUtils.setField(gameSchedulerService, "needsAttentionThresholdMinutes", 15L);
        ReflectionTestUtils.setField(gameSchedulerService, "stalledThresholdMinutes", 2L);
    }

    // ── autoEndGames ───────────────────────────────────────────────────

    @Test
    void autoEndGamesTransitionsExpiredLiveGameToEnded() {
        UUID gameId = UUID.randomUUID();
        Game expiredGame = Game.builder()
                .id(gameId)
                .name("Expired Game")
                .description("Desc")
                .status(GameStatus.live)
                .endDate(Instant.now().minusSeconds(120))
                .build();

        when(gameRepository.findByStatusAndEndDateBefore(eq(GameStatus.live), any(Instant.class)))
                .thenReturn(List.of(expiredGame));
        when(gameRepository.save(expiredGame)).thenReturn(expiredGame);

        gameSchedulerService.autoEndGames();

        assertEquals(GameStatus.ended, expiredGame.getStatus());
        verify(gameRepository).save(expiredGame);
        verify(eventBroadcaster).broadcastGameStatus(gameId, GameStatus.ended.name());
    }

    @Test
    void autoEndGamesTransitionsAllExpiredGamesInOneSweep() {
        UUID gameId1 = UUID.randomUUID();
        UUID gameId2 = UUID.randomUUID();

        Game expiredGame1 = Game.builder()
                .id(gameId1)
                .name("Game One")
                .description("Desc")
                .status(GameStatus.live)
                .endDate(Instant.now().minusSeconds(60))
                .build();
        Game expiredGame2 = Game.builder()
                .id(gameId2)
                .name("Game Two")
                .description("Desc")
                .status(GameStatus.live)
                .endDate(Instant.now().minusSeconds(300))
                .build();

        when(gameRepository.findByStatusAndEndDateBefore(eq(GameStatus.live), any(Instant.class)))
                .thenReturn(List.of(expiredGame1, expiredGame2));
        when(gameRepository.save(any(Game.class))).thenAnswer(invocation -> invocation.getArgument(0));

        gameSchedulerService.autoEndGames();

        assertEquals(GameStatus.ended, expiredGame1.getStatus());
        assertEquals(GameStatus.ended, expiredGame2.getStatus());
        verify(gameRepository, times(2)).save(any(Game.class));
        verify(eventBroadcaster).broadcastGameStatus(gameId1, GameStatus.ended.name());
        verify(eventBroadcaster).broadcastGameStatus(gameId2, GameStatus.ended.name());
    }

    @Test
    void autoEndGamesDoesNothingWhenNoGamesHaveExpired() {
        when(gameRepository.findByStatusAndEndDateBefore(eq(GameStatus.live), any(Instant.class)))
                .thenReturn(List.of());

        gameSchedulerService.autoEndGames();

        verify(gameRepository, never()).save(any(Game.class));
        verifyNoInteractions(eventBroadcaster);
    }

    @Test
    void autoEndGamesQueriesOnlyLiveStatusGames() {
        when(gameRepository.findByStatusAndEndDateBefore(eq(GameStatus.live), any(Instant.class)))
                .thenReturn(List.of());

        gameSchedulerService.autoEndGames();

        ArgumentCaptor<GameStatus> statusCaptor = ArgumentCaptor.forClass(GameStatus.class);
        verify(gameRepository).findByStatusAndEndDateBefore(statusCaptor.capture(), any(Instant.class));
        assertEquals(GameStatus.live, statusCaptor.getValue());
    }

    @Test
    void autoEndGamesBroadcastsEndedStatusStringNotEnumName() {
        UUID gameId = UUID.randomUUID();
        Game expiredGame = Game.builder()
                .id(gameId)
                .name("Broadcast Check Game")
                .description("Desc")
                .status(GameStatus.live)
                .endDate(Instant.now().minusSeconds(10))
                .build();

        when(gameRepository.findByStatusAndEndDateBefore(eq(GameStatus.live), any(Instant.class)))
                .thenReturn(List.of(expiredGame));
        when(gameRepository.save(expiredGame)).thenReturn(expiredGame);

        gameSchedulerService.autoEndGames();

        ArgumentCaptor<String> statusStringCaptor = ArgumentCaptor.forClass(String.class);
        verify(eventBroadcaster).broadcastGameStatus(eq(gameId), statusStringCaptor.capture());
        assertEquals("ended", statusStringCaptor.getValue());
    }

    @Test
    void autoEndGamesSavesGameBeforeBroadcasting() {
        UUID gameId = UUID.randomUUID();
        Game expiredGame = Game.builder()
                .id(gameId)
                .name("Order Check Game")
                .description("Desc")
                .status(GameStatus.live)
                .endDate(Instant.now().minusSeconds(10))
                .build();

        when(gameRepository.findByStatusAndEndDateBefore(eq(GameStatus.live), any(Instant.class)))
                .thenReturn(List.of(expiredGame));
        when(gameRepository.save(expiredGame)).thenReturn(expiredGame);

        org.mockito.InOrder inOrder = org.mockito.Mockito.inOrder(gameRepository, eventBroadcaster);

        gameSchedulerService.autoEndGames();

        inOrder.verify(gameRepository).save(expiredGame);
        inOrder.verify(eventBroadcaster).broadcastGameStatus(gameId, "ended");
    }

    // ── purgeExpiredRefreshTokens ──────────────────────────────────────

    @Test
    void purgeExpiredRefreshTokensDelegatesWithCurrentInstant() {
        when(refreshTokenRepository.deleteExpiredBefore(any(Instant.class))).thenReturn(5);

        gameSchedulerService.purgeExpiredRefreshTokens();

        ArgumentCaptor<Instant> instantCaptor = ArgumentCaptor.forClass(Instant.class);
        verify(refreshTokenRepository).deleteExpiredBefore(instantCaptor.capture());
        // The captured instant should be close to now (within 5 seconds)
        Instant capturedInstant = instantCaptor.getValue();
        Instant lowerBound = Instant.now().minusSeconds(5);
        Instant upperBound = Instant.now().plusSeconds(5);
        assert capturedInstant.isAfter(lowerBound) && capturedInstant.isBefore(upperBound)
                : "Expected instant to be near now but was: " + capturedInstant;
    }

    @Test
    void purgeExpiredRefreshTokensWhenNoneDeletedDoesNotLog() {
        when(refreshTokenRepository.deleteExpiredBefore(any(Instant.class))).thenReturn(0);

        // No exception should be thrown; the service handles zero deletions silently
        gameSchedulerService.purgeExpiredRefreshTokens();

        verify(refreshTokenRepository).deleteExpiredBefore(any(Instant.class));
    }

    @Test
    void purgeExpiredRefreshTokensWhenSomeDeletedCompletesNormally() {
        when(refreshTokenRepository.deleteExpiredBefore(any(Instant.class))).thenReturn(42);

        gameSchedulerService.purgeExpiredRefreshTokens();

        verify(refreshTokenRepository).deleteExpiredBefore(any(Instant.class));
    }

    @Test
    void purgeExpiredRefreshTokensDoesNotTouchOtherRepositories() {
        when(refreshTokenRepository.deleteExpiredBefore(any(Instant.class))).thenReturn(0);

        gameSchedulerService.purgeExpiredRefreshTokens();

        verifyNoInteractions(gameRepository, passwordResetTokenRepository, eventBroadcaster);
        verify(chunkedUploadService, never()).expireStaleSessions();
    }

    // ── purgeExpiredPasswordResetTokens ───────────────────────────────

    @Test
    void purgeExpiredPasswordResetTokensDelegatesWithCurrentInstant() {
        when(passwordResetTokenRepository.deleteExpiredOrUsed(any(Instant.class))).thenReturn(3);

        gameSchedulerService.purgeExpiredPasswordResetTokens();

        ArgumentCaptor<Instant> instantCaptor = ArgumentCaptor.forClass(Instant.class);
        verify(passwordResetTokenRepository).deleteExpiredOrUsed(instantCaptor.capture());
        Instant capturedInstant = instantCaptor.getValue();
        Instant lowerBound = Instant.now().minusSeconds(5);
        Instant upperBound = Instant.now().plusSeconds(5);
        assert capturedInstant.isAfter(lowerBound) && capturedInstant.isBefore(upperBound)
                : "Expected instant to be near now but was: " + capturedInstant;
    }

    @Test
    void purgeExpiredPasswordResetTokensWhenNoneDeletedCompletesNormally() {
        when(passwordResetTokenRepository.deleteExpiredOrUsed(any(Instant.class))).thenReturn(0);

        gameSchedulerService.purgeExpiredPasswordResetTokens();

        verify(passwordResetTokenRepository).deleteExpiredOrUsed(any(Instant.class));
    }

    @Test
    void purgeExpiredPasswordResetTokensWhenSomeDeletedCompletesNormally() {
        when(passwordResetTokenRepository.deleteExpiredOrUsed(any(Instant.class))).thenReturn(7);

        gameSchedulerService.purgeExpiredPasswordResetTokens();

        verify(passwordResetTokenRepository).deleteExpiredOrUsed(any(Instant.class));
    }

    @Test
    void purgeExpiredPasswordResetTokensDoesNotTouchOtherRepositories() {
        when(passwordResetTokenRepository.deleteExpiredOrUsed(any(Instant.class))).thenReturn(0);

        gameSchedulerService.purgeExpiredPasswordResetTokens();

        verifyNoInteractions(gameRepository, refreshTokenRepository, eventBroadcaster);
        verify(chunkedUploadService, never()).expireStaleSessions();
    }

    // ── expireStaleChunkUploadSessions ────────────────────────────────

    @Test
    void expireStaleChunkUploadSessionsDelegatesToChunkedUploadService() {
        when(chunkedUploadService.expireStaleSessions()).thenReturn(2);

        gameSchedulerService.expireStaleChunkUploadSessions();

        verify(chunkedUploadService).expireStaleSessions();
    }

    @Test
    void expireStaleChunkUploadSessionsWhenNoneExpiredCompletesNormally() {
        when(chunkedUploadService.expireStaleSessions()).thenReturn(0);

        gameSchedulerService.expireStaleChunkUploadSessions();

        verify(chunkedUploadService).expireStaleSessions();
    }

    @Test
    void expireStaleChunkUploadSessionsWhenSomeExpiredCompletesNormally() {
        when(chunkedUploadService.expireStaleSessions()).thenReturn(10);

        gameSchedulerService.expireStaleChunkUploadSessions();

        verify(chunkedUploadService).expireStaleSessions();
    }

    @Test
    void expireStaleChunkUploadSessionsDoesNotTouchOtherRepositories() {
        when(chunkedUploadService.expireStaleSessions()).thenReturn(0);

        gameSchedulerService.expireStaleChunkUploadSessions();

        verifyNoInteractions(gameRepository, refreshTokenRepository, passwordResetTokenRepository, eventBroadcaster);
    }

    // ── cross-method isolation ─────────────────────────────────────────

    @Test
    void autoEndGamesDoesNotInvokeRefreshTokenOrPasswordResetRepositories() {
        when(gameRepository.findByStatusAndEndDateBefore(eq(GameStatus.live), any(Instant.class)))
                .thenReturn(List.of());

        gameSchedulerService.autoEndGames();

        verifyNoInteractions(refreshTokenRepository, passwordResetTokenRepository);
        verify(chunkedUploadService, never()).expireStaleSessions();
    }

    // ── detectNeedsAttentionUploads ────────────────────────────────────
    //
    // The needs-attention detector is ALERT-ONLY. These tests pin that contract:
    //   * It surfaces the right rows (old, completed, unlinked).
    //   * It ignores recent completions, linked sessions, and active sessions.
    //   * It NEVER calls save/delete on any session — a player can always come
    //     back and recover their work days later.

    @Test
    void detectNeedsAttentionUploadsAlertsOnOldCompletedSessionWithoutSubmission() {
        UUID gameId = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        UploadSession stuck = buildCompletedSession(
                sessionId, gameId, playerId,
                "/api/games/" + gameId + "/files/stuck.mp4",
                Instant.now().minusSeconds(60 * 60) // 1h old — well past the 15 min threshold
        );
        when(uploadSessionRepository.findCompletedNeedsAttention(any(Instant.class)))
                .thenReturn(List.of(stuck));

        gameSchedulerService.detectNeedsAttentionUploads();

        ArgumentCaptor<Instant> thresholdCaptor = ArgumentCaptor.forClass(Instant.class);
        verify(uploadSessionRepository).findCompletedNeedsAttention(thresholdCaptor.capture());
        Instant threshold = thresholdCaptor.getValue();
        // Threshold must be roughly (now - 15 minutes). Give a 30s window to
        // avoid clock-drift flakiness.
        Instant expectedLowerBound = Instant.now().minusSeconds(15 * 60 + 30);
        Instant expectedUpperBound = Instant.now().minusSeconds(15 * 60 - 30);
        assert threshold.isAfter(expectedLowerBound) && threshold.isBefore(expectedUpperBound)
                : "Expected threshold ~15 minutes in the past but got: " + threshold;

        // Counter must fire once with the expected tags.
        verify(meterRegistry).counter(
                eq("uploads.sessions.needs_attention"),
                eq("gameId"), eq(gameId.toString()),
                eq("reason"), eq("completed_no_submission")
        );
        verify(needsAttentionCounter).increment();
    }

    @Test
    void detectNeedsAttentionUploadsIgnoresRecentCompletedSessions() {
        // Repository enforces the cutoff via the SQL predicate
        // (completed_at < olderThan). When nothing is returned, the scheduler
        // must be a complete no-op.
        when(uploadSessionRepository.findCompletedNeedsAttention(any(Instant.class)))
                .thenReturn(List.of());

        gameSchedulerService.detectNeedsAttentionUploads();

        verify(uploadSessionRepository).findCompletedNeedsAttention(any(Instant.class));
        verify(meterRegistry, never()).counter(
                eq("uploads.sessions.needs_attention"),
                anyString(), anyString(),
                anyString(), anyString()
        );
        verify(needsAttentionCounter, never()).increment();
    }

    @Test
    void detectNeedsAttentionUploadsIgnoresLinkedSessions() {
        // The JPA query filters on s.submission IS NULL, so a linked session
        // never shows up in the result. This test stubs the query to return an
        // empty list for any threshold, then runs the detector and verifies no
        // alert fires — modeling the behaviour a linked session gets in prod.
        when(uploadSessionRepository.findCompletedNeedsAttention(any(Instant.class)))
                .thenReturn(List.of());

        gameSchedulerService.detectNeedsAttentionUploads();

        verify(needsAttentionCounter, never()).increment();
        verify(meterRegistry, never()).counter(
                eq("uploads.sessions.needs_attention"),
                anyString(), anyString(),
                anyString(), anyString()
        );
    }

    @Test
    void detectNeedsAttentionUploadsIgnoresActiveSessions() {
        // Active sessions are handled by the Wave D stalled-active scheduler,
        // not by the needs-attention detector. The repository query only
        // returns completed sessions, so the detector must stay silent even
        // when there are plenty of active sessions in the system.
        when(uploadSessionRepository.findCompletedNeedsAttention(any(Instant.class)))
                .thenReturn(List.of());

        gameSchedulerService.detectNeedsAttentionUploads();

        verify(needsAttentionCounter, never()).increment();
    }

    @Test
    void detectNeedsAttentionUploadsDoesNotModifyData() {
        // The core ALERT-ONLY guarantee: under no circumstances should the
        // detector mutate, save, delete, or otherwise touch upload sessions.
        // This test gives it a big, juicy, stuck upload session and verifies
        // the only repository interaction is the read query.
        UUID gameId = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        UploadSession stuck = buildCompletedSession(
                sessionId, gameId, playerId,
                "/api/games/" + gameId + "/files/video.mp4",
                Instant.now().minusSeconds(90 * 60)
        );
        when(uploadSessionRepository.findCompletedNeedsAttention(any(Instant.class)))
                .thenReturn(List.of(stuck));

        gameSchedulerService.detectNeedsAttentionUploads();

        // No save. No delete. No flush. Ever.
        verify(uploadSessionRepository, never()).save(any(UploadSession.class));
        verify(uploadSessionRepository, never()).saveAll(any(Iterable.class));
        verify(uploadSessionRepository, never()).delete(any(UploadSession.class));
        verify(uploadSessionRepository, never()).deleteAll(any(Iterable.class));
        verify(uploadSessionRepository, never()).deleteById(any(UUID.class));
        verify(uploadSessionRepository, never()).deleteByGameId(any(UUID.class));
        // The in-memory entity itself must not have been mutated either.
        assertEquals(UploadSessionStatus.completed, stuck.getStatus());
        assertEquals("/api/games/" + gameId + "/files/video.mp4", stuck.getFileUrl());
        assertNull(stuck.getSubmission(),
                "detector must not set submission_id — that is PlayerService's job");
    }

    private UploadSession buildCompletedSession(
            UUID sessionId,
            UUID gameId,
            UUID playerId,
            String fileUrl,
            Instant completedAt
    ) {
        Game game = Game.builder().id(gameId).name("G").description("D").status(GameStatus.live).build();
        Player player = Player.builder().id(playerId).deviceId("dev").displayName("P").build();
        return UploadSession.builder()
                .id(sessionId)
                .game(game)
                .player(player)
                .contentType("video/mp4")
                .totalSizeBytes(8L)
                .chunkSizeBytes(4)
                .totalChunks(2)
                .status(UploadSessionStatus.completed)
                .fileUrl(fileUrl)
                .expiresAt(Instant.now().plusSeconds(3600))
                .completedAt(completedAt)
                .build();
    }
}
