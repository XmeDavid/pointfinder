package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.PasswordResetTokenRepository;
import com.prayer.pointfinder.repository.RefreshTokenRepository;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
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
    private GameEventBroadcaster eventBroadcaster;

    @InjectMocks
    private GameSchedulerService gameSchedulerService;

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
}
