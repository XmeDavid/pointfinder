package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.UploadSessionInitRequest;
import com.prayer.pointfinder.dto.response.UploadSessionClearResponse;
import com.prayer.pointfinder.dto.response.UploadSessionResponse;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.UploadSession;
import com.prayer.pointfinder.entity.UploadSessionChunk;
import com.prayer.pointfinder.entity.UploadSessionStatus;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.UploadSessionException;
import com.prayer.pointfinder.repository.PlayerRepository;
import com.prayer.pointfinder.repository.UploadSessionChunkRepository;
import com.prayer.pointfinder.repository.UploadSessionRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;
import org.junit.jupiter.api.extension.ExtendWith;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ChunkedUploadServiceTest {

    @TempDir
    Path tempDir;

    @Mock
    private UploadSessionRepository uploadSessionRepository;
    @Mock
    private UploadSessionChunkRepository uploadSessionChunkRepository;
    @Mock
    private PlayerRepository playerRepository;
    @Mock
    private GameAccessService gameAccessService;
    @Mock
    private FileStorageService fileStorageService;
    @Mock
    private MeterRegistry meterRegistry;

    private ChunkedUploadService chunkedUploadService;

    private final Map<UUID, UploadSession> sessions = new HashMap<>();
    private final Map<UUID, Set<Integer>> uploadedChunks = new HashMap<>();

    @BeforeEach
    void setUp() {
        chunkedUploadService = new ChunkedUploadService(
                uploadSessionRepository,
                uploadSessionChunkRepository,
                playerRepository,
                gameAccessService,
                fileStorageService,
                meterRegistry
        );
        ReflectionTestUtils.setField(chunkedUploadService, "uploadsPath", tempDir.toString());
        ReflectionTestUtils.setField(chunkedUploadService, "defaultChunkSizeBytes", 4);
        ReflectionTestUtils.setField(chunkedUploadService, "chunkedUploadEnabled", true);
        ReflectionTestUtils.setField(chunkedUploadService, "maxChunkSizeBytes", 16 * 1024 * 1024);
        ReflectionTestUtils.setField(chunkedUploadService, "uploadSessionTtlSeconds", 3600L);
        ReflectionTestUtils.setField(chunkedUploadService, "maxActiveSessionsPerPlayer", 5);
        ReflectionTestUtils.setField(chunkedUploadService, "maxActiveBytesPerGame", 1024L * 1024L * 1024L);
        Counter counter = mock(Counter.class);
        when(meterRegistry.counter(any(String.class))).thenReturn(counter);
        when(meterRegistry.counter(any(String.class), any(String.class), any(String.class))).thenReturn(counter);

        when(uploadSessionRepository.save(any(UploadSession.class))).thenAnswer(invocation -> {
            UploadSession session = invocation.getArgument(0);
            if (session.getId() == null) {
                session.setId(UUID.randomUUID());
            }
            Instant now = Instant.now();
            if (session.getCreatedAt() == null) {
                session.setCreatedAt(now);
            }
            session.setUpdatedAt(now);
            sessions.put(session.getId(), session);
            return session;
        });
        when(uploadSessionRepository.findById(any(UUID.class))).thenAnswer(invocation ->
                Optional.ofNullable(sessions.get(invocation.getArgument(0)))
        );
        when(uploadSessionRepository.countActiveSessionsByPlayerId(any(UUID.class), eq(UploadSessionStatus.active), any(Instant.class)))
                .thenAnswer(invocation -> {
                    UUID playerId = invocation.getArgument(0);
                    Instant now = invocation.getArgument(2);
                    return sessions.values().stream()
                            .filter(session -> session.getPlayer().getId().equals(playerId))
                            .filter(session -> session.getStatus() == UploadSessionStatus.active)
                            .filter(session -> session.getExpiresAt().isAfter(now))
                            .count();
                });
        when(uploadSessionRepository.sumActiveBytesByGame(any(UUID.class), eq(UploadSessionStatus.active), any(Instant.class)))
                .thenAnswer(invocation -> {
                    UUID gameId = invocation.getArgument(0);
                    Instant now = invocation.getArgument(2);
                    return sessions.values().stream()
                            .filter(session -> session.getGame().getId().equals(gameId))
                            .filter(session -> session.getStatus() == UploadSessionStatus.active)
                            .filter(session -> session.getExpiresAt().isAfter(now))
                            .mapToLong(UploadSession::getTotalSizeBytes)
                            .sum();
                });
        when(uploadSessionRepository.findRecoverableSessionsByMediaItemKey(
                any(UUID.class), any(UUID.class), anyString(), any(), any()
        )).thenAnswer(invocation -> {
            UUID gameId = invocation.getArgument(0);
            UUID playerId = invocation.getArgument(1);
            String mediaItemKey = invocation.getArgument(2);
            Collection<UploadSessionStatus> statuses = invocation.getArgument(3);
            return sessions.values().stream()
                    .filter(session -> session.getGame().getId().equals(gameId))
                    .filter(session -> session.getPlayer().getId().equals(playerId))
                    .filter(session -> Objects.equals(session.getMediaItemKey(), mediaItemKey))
                    .filter(session -> statuses.contains(session.getStatus()))
                    .max(Comparator.comparing(UploadSession::getCreatedAt))
                    .map(List::of)
                    .orElseGet(List::of);
        });
        when(uploadSessionRepository.findByStatusAndExpiresAtBefore(eq(UploadSessionStatus.active), any(Instant.class)))
                .thenAnswer(invocation -> {
                    Instant now = invocation.getArgument(1);
                    List<UploadSession> list = new ArrayList<>();
                    for (UploadSession session : sessions.values()) {
                        if (session.getStatus() == UploadSessionStatus.active && session.getExpiresAt().isBefore(now)) {
                            list.add(session);
                        }
                    }
                    return list;
                });
        when(uploadSessionRepository.findExpiredActiveSessionsForPlayerInGame(
                any(UUID.class), any(UUID.class), eq(UploadSessionStatus.active), any(Instant.class)
        )).thenAnswer(invocation -> {
            UUID gameId = invocation.getArgument(0);
            UUID playerId = invocation.getArgument(1);
            Instant now = invocation.getArgument(3);
            return sessions.values().stream()
                    .filter(session -> session.getGame().getId().equals(gameId))
                    .filter(session -> session.getPlayer().getId().equals(playerId))
                    .filter(session -> session.getStatus() == UploadSessionStatus.active)
                    .filter(session -> !session.getExpiresAt().isAfter(now))
                    .toList();
        });
        when(uploadSessionRepository.findRecoverableSessionsForPlayerInGame(
                any(UUID.class), any(UUID.class), eq(UploadSessionStatus.active), eq(UploadSessionStatus.completed),
                any(Instant.class), any()
        )).thenAnswer(invocation -> {
            UUID gameId = invocation.getArgument(0);
            UUID playerId = invocation.getArgument(1);
            Instant now = invocation.getArgument(4);
            return sessions.values().stream()
                    .filter(session -> session.getGame().getId().equals(gameId))
                    .filter(session -> session.getPlayer().getId().equals(playerId))
                    .filter(session -> session.getStatus() == UploadSessionStatus.completed
                            || (session.getStatus() == UploadSessionStatus.active && session.getExpiresAt().isAfter(now)))
                    .sorted(Comparator.comparing(UploadSession::getUpdatedAt).reversed())
                    .limit(100)
                    .toList();
        });
        when(uploadSessionRepository.findClearableSessionsForPlayerInGame(
                any(UUID.class), any(UUID.class), any(), any()
        )).thenAnswer(invocation -> {
            UUID gameId = invocation.getArgument(0);
            UUID playerId = invocation.getArgument(1);
            String mediaItemKey = invocation.getArgument(2);
            Collection<UploadSessionStatus> statuses = invocation.getArgument(3);
            return sessions.values().stream()
                    .filter(session -> session.getGame().getId().equals(gameId))
                    .filter(session -> session.getPlayer().getId().equals(playerId))
                    .filter(session -> mediaItemKey == null || Objects.equals(session.getMediaItemKey(), mediaItemKey))
                    .filter(session -> statuses.contains(session.getStatus()))
                    .toList();
        });
        when(uploadSessionRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        when(uploadSessionChunkRepository.findUploadedChunkIndexes(any(UUID.class))).thenAnswer(invocation -> {
            UUID sessionId = invocation.getArgument(0);
            return uploadedChunks.getOrDefault(sessionId, Set.of()).stream().sorted().toList();
        });
        when(uploadSessionChunkRepository.countBySessionId(any(UUID.class))).thenAnswer(invocation -> {
            UUID sessionId = invocation.getArgument(0);
            return (long) uploadedChunks.getOrDefault(sessionId, Set.of()).size();
        });
        when(uploadSessionChunkRepository.save(any(UploadSessionChunk.class))).thenAnswer(invocation -> {
            UploadSessionChunk chunk = invocation.getArgument(0);
            uploadedChunks.computeIfAbsent(chunk.getSessionId(), ignored -> new HashSet<>()).add(chunk.getChunkIndex());
            return chunk;
        });
        doAnswer(invocation -> {
            UUID sessionId = invocation.getArgument(0);
            uploadedChunks.remove(sessionId);
            return null;
        }).when(uploadSessionChunkRepository).deleteBySessionId(any(UUID.class));
        doAnswer(invocation -> {
            UUID sessionId = invocation.getArgument(0);
            int chunkIndex = invocation.getArgument(1);
            uploadedChunks.computeIfPresent(sessionId, (ignored, chunks) -> {
                chunks.remove(chunkIndex);
                return chunks;
            });
            return null;
        }).when(uploadSessionChunkRepository).deleteBySessionIdAndChunkIndex(any(UUID.class), anyInt());

        doNothing().when(fileStorageService).validateChunkedUploadMetadata(anyString(), anyLong());
        when(fileStorageService.maxFileSizeBytes()).thenReturn(1024L * 1024L * 1024L);
    }

    @Test
    void chunkUploadSupportsOutOfOrderAndCompleteIsIdempotent() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();
        Player authPlayer = Player.builder().id(playerId).build();
        Player managedPlayer = buildPlayer(playerId, gameId);
        when(playerRepository.findAuthPlayerById(playerId)).thenReturn(Optional.of(managedPlayer));
        doNothing().when(gameAccessService).ensurePlayerBelongsToGame(any(Player.class), eq(gameId));

        UploadSessionInitRequest request = new UploadSessionInitRequest();
        request.setContentType("video/mp4");
        request.setTotalSizeBytes(8L);
        request.setChunkSizeBytes(4);
        request.setMediaItemKey("local-video-1");

        AtomicInteger storeCalls = new AtomicInteger(0);
        when(fileStorageService.storeAssembledUpload(any(Path.class), eq(gameId), eq("video/mp4"), eq(8L)))
                .thenAnswer(invocation -> {
                    storeCalls.incrementAndGet();
                    Path assembled = invocation.getArgument(0);
                    assertTrue(Files.exists(assembled));
                    assertEquals("AAAABBBB", Files.readString(assembled));
                    return "/api/games/" + gameId + "/files/final.mp4";
                });

        UploadSessionResponse created = chunkedUploadService.createSession(gameId, authPlayer, request);
        UUID sessionId = created.getSessionId();
        chunkedUploadService.uploadChunk(gameId, sessionId, 1, "BBBB".getBytes(), authPlayer);
        chunkedUploadService.uploadChunk(gameId, sessionId, 0, "AAAA".getBytes(), authPlayer);
        UploadSessionResponse completed = chunkedUploadService.completeSession(gameId, sessionId, authPlayer);
        UploadSessionResponse completedAgain = chunkedUploadService.completeSession(gameId, sessionId, authPlayer);
        UploadSessionResponse recoveredCompleted = chunkedUploadService.createSession(gameId, authPlayer, request);

        assertEquals("completed", completed.getStatus());
        assertEquals("/api/games/" + gameId + "/files/final.mp4", completed.getFileUrl());
        assertEquals(List.of(0, 1), completed.getUploadedChunks());
        assertEquals("completed", completedAgain.getStatus());
        assertEquals(sessionId, recoveredCompleted.getSessionId());
        assertEquals("/api/games/" + gameId + "/files/final.mp4", recoveredCompleted.getFileUrl());
        assertEquals(1, storeCalls.get());
        verify(uploadSessionChunkRepository).deleteBySessionId(sessionId);
    }

    @Test
    void createSessionWithMediaItemKeyResumesActiveSession() {
        UUID gameId = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();
        Player authPlayer = Player.builder().id(playerId).build();
        Player managedPlayer = buildPlayer(playerId, gameId);
        when(playerRepository.findAuthPlayerById(playerId)).thenReturn(Optional.of(managedPlayer));
        doNothing().when(gameAccessService).ensurePlayerBelongsToGame(any(Player.class), eq(gameId));

        UploadSessionInitRequest request = uploadRequest("field-video-1");

        UploadSessionResponse created = chunkedUploadService.createSession(gameId, authPlayer, request);
        UploadSessionResponse resumed = chunkedUploadService.createSession(gameId, authPlayer, request);

        assertEquals(created.getSessionId(), resumed.getSessionId());
        assertEquals("active", resumed.getStatus());
        assertEquals("field-video-1", resumed.getMediaItemKey());
        assertEquals(1, sessions.size());
    }

    @Test
    void expiredActiveSessionsDoNotBlockSessionCap() {
        ReflectionTestUtils.setField(chunkedUploadService, "maxActiveSessionsPerPlayer", 1);
        UUID gameId = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();
        Player authPlayer = Player.builder().id(playerId).build();
        Player managedPlayer = buildPlayer(playerId, gameId);
        when(playerRepository.findAuthPlayerById(playerId)).thenReturn(Optional.of(managedPlayer));
        doNothing().when(gameAccessService).ensurePlayerBelongsToGame(any(Player.class), eq(gameId));

        UploadSessionResponse stale = chunkedUploadService.createSession(gameId, authPlayer, uploadRequest("stale"));
        sessions.get(stale.getSessionId()).setExpiresAt(Instant.now().minusSeconds(5));

        UploadSessionResponse replacement = chunkedUploadService.createSession(gameId, authPlayer, uploadRequest("replacement"));

        assertEquals(UploadSessionStatus.expired, sessions.get(stale.getSessionId()).getStatus());
        assertEquals("active", replacement.getStatus());
    }

    @Test
    void mismatchedMediaItemKeyMetadataIsPermanentConflict() {
        UUID gameId = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();
        Player authPlayer = Player.builder().id(playerId).build();
        Player managedPlayer = buildPlayer(playerId, gameId);
        when(playerRepository.findAuthPlayerById(playerId)).thenReturn(Optional.of(managedPlayer));
        doNothing().when(gameAccessService).ensurePlayerBelongsToGame(any(Player.class), eq(gameId));

        chunkedUploadService.createSession(gameId, authPlayer, uploadRequest("same-key"));
        UploadSessionInitRequest changed = uploadRequest("same-key");
        changed.setTotalSizeBytes(12L);

        UploadSessionException exception = assertThrows(
                UploadSessionException.class,
                () -> chunkedUploadService.createSession(gameId, authPlayer, changed)
        );

        assertEquals("UPLOAD_MEDIA_ITEM_KEY_CONFLICT", exception.getCode());
        assertEquals(false, exception.isRetryable());
    }

    @Test
    void listRecoverableSessionsKeepsCompletedItemsAndDropsExpiredActiveSessions() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();
        Player authPlayer = Player.builder().id(playerId).build();
        Player managedPlayer = buildPlayer(playerId, gameId);
        when(playerRepository.findAuthPlayerById(playerId)).thenReturn(Optional.of(managedPlayer));
        doNothing().when(gameAccessService).ensurePlayerBelongsToGame(any(Player.class), eq(gameId));

        UploadSessionResponse active = chunkedUploadService.createSession(gameId, authPlayer, uploadRequest("active"));
        UploadSessionResponse expired = chunkedUploadService.createSession(gameId, authPlayer, uploadRequest("expired"));
        sessions.get(expired.getSessionId()).setExpiresAt(Instant.now().minusSeconds(5));

        UploadSessionInitRequest completedRequest = uploadRequest("completed");
        UploadSessionResponse completed = chunkedUploadService.createSession(gameId, authPlayer, completedRequest);
        when(fileStorageService.storeAssembledUpload(any(Path.class), eq(gameId), eq("video/mp4"), eq(8L)))
                .thenReturn("/api/games/" + gameId + "/files/completed.mp4");
        chunkedUploadService.uploadChunk(gameId, completed.getSessionId(), 0, "AAAA".getBytes(), authPlayer);
        chunkedUploadService.uploadChunk(gameId, completed.getSessionId(), 1, "BBBB".getBytes(), authPlayer);
        chunkedUploadService.completeSession(gameId, completed.getSessionId(), authPlayer);

        List<UploadSessionResponse> recoverable = chunkedUploadService.listRecoverableSessions(gameId, authPlayer);

        assertTrue(recoverable.stream().anyMatch(session -> session.getSessionId().equals(active.getSessionId())));
        assertTrue(recoverable.stream().anyMatch(session -> session.getSessionId().equals(completed.getSessionId())
                && ("/api/games/" + gameId + "/files/completed.mp4").equals(session.getFileUrl())));
        assertTrue(recoverable.stream().noneMatch(session -> session.getSessionId().equals(expired.getSessionId())));
        assertEquals(UploadSessionStatus.expired, sessions.get(expired.getSessionId()).getStatus());
    }

    @Test
    void clearAbandonedSessionsCancelsOnlyNonCompletedSessions() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();
        Player authPlayer = Player.builder().id(playerId).build();
        Player managedPlayer = buildPlayer(playerId, gameId);
        when(playerRepository.findAuthPlayerById(playerId)).thenReturn(Optional.of(managedPlayer));
        doNothing().when(gameAccessService).ensurePlayerBelongsToGame(any(Player.class), eq(gameId));

        UploadSessionResponse active = chunkedUploadService.createSession(gameId, authPlayer, uploadRequest("active"));
        UploadSessionResponse completed = chunkedUploadService.createSession(gameId, authPlayer, uploadRequest("completed"));
        when(fileStorageService.storeAssembledUpload(any(Path.class), eq(gameId), eq("video/mp4"), eq(8L)))
                .thenReturn("/api/games/" + gameId + "/files/completed.mp4");
        chunkedUploadService.uploadChunk(gameId, completed.getSessionId(), 0, "AAAA".getBytes(), authPlayer);
        chunkedUploadService.uploadChunk(gameId, completed.getSessionId(), 1, "BBBB".getBytes(), authPlayer);
        chunkedUploadService.completeSession(gameId, completed.getSessionId(), authPlayer);

        UploadSessionClearResponse clear = chunkedUploadService.clearAbandonedSessions(gameId, authPlayer, null);

        assertEquals(1, clear.getCancelledSessions());
        assertEquals(1, clear.getClearedSessions());
        assertEquals(UploadSessionStatus.cancelled, sessions.get(active.getSessionId()).getStatus());
        assertEquals(UploadSessionStatus.completed, sessions.get(completed.getSessionId()).getStatus());
    }

    @Test
    void completeSessionDoesNotTouchSubmissionId() throws Exception {
        // Chunked upload is a pure media workflow. Linking an upload to a submission
        // is PlayerService.submitAnswer's job, not ChunkedUploadService's. If
        // completeSession ever starts touching submission_id, the needs-attention
        // detector would miss real incidents because the bytes would look "consumed"
        // the instant they land on disk, even before the player ever confirms the
        // submission. This test pins that boundary in place.
        UUID gameId = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();
        Player authPlayer = Player.builder().id(playerId).build();
        Player managedPlayer = buildPlayer(playerId, gameId);
        when(playerRepository.findAuthPlayerById(playerId)).thenReturn(Optional.of(managedPlayer));
        doNothing().when(gameAccessService).ensurePlayerBelongsToGame(any(Player.class), eq(gameId));

        UploadSessionResponse created = chunkedUploadService.createSession(
                gameId, authPlayer, uploadRequest("no-link-media-item")
        );
        UUID sessionId = created.getSessionId();

        when(fileStorageService.storeAssembledUpload(any(Path.class), eq(gameId), eq("video/mp4"), eq(8L)))
                .thenReturn("/api/games/" + gameId + "/files/no-link.mp4");

        chunkedUploadService.uploadChunk(gameId, sessionId, 0, "AAAA".getBytes(), authPlayer);
        chunkedUploadService.uploadChunk(gameId, sessionId, 1, "BBBB".getBytes(), authPlayer);
        UploadSessionResponse completed = chunkedUploadService.completeSession(gameId, sessionId, authPlayer);

        assertEquals("completed", completed.getStatus());
        UploadSession stored = sessions.get(sessionId);
        assertEquals(UploadSessionStatus.completed, stored.getStatus());
        assertNull(stored.getSubmission(),
                "completeSession must never populate submission_id — that is PlayerService.submitAnswer's responsibility");
        assertEquals("/api/games/" + gameId + "/files/no-link.mp4", stored.getFileUrl());
    }


    @Test
    void uploadSessionEnforcesPlayerOwnership() {
        UUID gameId = UUID.randomUUID();
        UUID ownerPlayerId = UUID.randomUUID();
        UUID otherPlayerId = UUID.randomUUID();

        Player ownerAuth = Player.builder().id(ownerPlayerId).build();
        Player ownerManaged = buildPlayer(ownerPlayerId, gameId);
        when(playerRepository.findAuthPlayerById(ownerPlayerId)).thenReturn(Optional.of(ownerManaged));
        doNothing().when(gameAccessService).ensurePlayerBelongsToGame(any(Player.class), eq(gameId));

        UploadSessionInitRequest request = new UploadSessionInitRequest();
        request.setContentType("video/mp4");
        request.setTotalSizeBytes(8L);
        request.setChunkSizeBytes(4);
        UploadSessionResponse created = chunkedUploadService.createSession(gameId, ownerAuth, request);

        Player otherAuth = Player.builder().id(otherPlayerId).build();
        Player otherManaged = buildPlayer(otherPlayerId, gameId);
        when(playerRepository.findAuthPlayerById(otherPlayerId)).thenReturn(Optional.of(otherManaged));

        assertThrows(
                BadRequestException.class,
                () -> chunkedUploadService.getSession(gameId, created.getSessionId(), otherAuth)
        );
    }


    private UploadSessionInitRequest uploadRequest(String mediaItemKey) {
        UploadSessionInitRequest request = new UploadSessionInitRequest();
        request.setContentType("video/mp4");
        request.setTotalSizeBytes(8L);
        request.setChunkSizeBytes(4);
        request.setMediaItemKey(mediaItemKey);
        return request;
    }

    private Player buildPlayer(UUID playerId, UUID gameId) {
        Game game = Game.builder()
                .id(gameId)
                .status(GameStatus.live)
                .name("Game")
                .description("Desc")
                .build();
        Team team = Team.builder()
                .id(UUID.randomUUID())
                .game(game)
                .name("Team")
                .joinCode("JOIN123")
                .color("#fff000")
                .build();
        return Player.builder()
                .id(playerId)
                .team(team)
                .deviceId("device")
                .displayName("Player")
                .build();
    }
}
