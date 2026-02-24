package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.UploadSessionInitRequest;
import com.prayer.pointfinder.dto.response.UploadSessionResponse;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.UploadSession;
import com.prayer.pointfinder.entity.UploadSessionChunk;
import com.prayer.pointfinder.entity.UploadSessionStatus;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.PlayerRepository;
import com.prayer.pointfinder.repository.UploadSessionChunkRepository;
import com.prayer.pointfinder.repository.UploadSessionRepository;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

@Service
@RequiredArgsConstructor
@Slf4j
public class ChunkedUploadService {

    private final UploadSessionRepository uploadSessionRepository;
    private final UploadSessionChunkRepository uploadSessionChunkRepository;
    private final PlayerRepository playerRepository;
    private final GameAccessService gameAccessService;
    private final FileStorageService fileStorageService;
    private final MeterRegistry meterRegistry;

    @Value("${app.uploads.path:/uploads}")
    private String uploadsPath;

    @Value("${app.uploads.chunk.default-size-bytes:8388608}")
    private int defaultChunkSizeBytes;

    @Value("${app.uploads.chunk.enabled:true}")
    private boolean chunkedUploadEnabled;

    @Value("${app.uploads.chunk.max-size-bytes:16777216}")
    private int maxChunkSizeBytes;

    @Value("${app.uploads.chunk.session-ttl-seconds:172800}")
    private long uploadSessionTtlSeconds;

    @Value("${app.uploads.limits.max-active-sessions-per-player:3}")
    private int maxActiveSessionsPerPlayer;

    @Value("${app.uploads.limits.max-active-bytes-per-game:17179869184}")
    private long maxActiveBytesPerGame;

    @Transactional
    public UploadSessionResponse createSession(UUID gameId, Player authPlayer, UploadSessionInitRequest request) {
        if (!chunkedUploadEnabled) {
            throw new BadRequestException("Chunked uploads are temporarily disabled");
        }
        Player player = loadPlayer(authPlayer);
        gameAccessService.ensurePlayerBelongsToGame(player, gameId);
        ensureGameIsLive(player);

        long totalSizeBytes = request.getTotalSizeBytes();
        if (totalSizeBytes <= 0) {
            throw new BadRequestException("totalSizeBytes must be positive");
        }
        if (totalSizeBytes > fileStorageService.maxFileSizeBytes()) {
            throw new BadRequestException("File size exceeds allowed limit");
        }
        long playerActiveSessions = uploadSessionRepository.countByPlayerIdAndStatus(player.getId(), UploadSessionStatus.active);
        if (playerActiveSessions >= maxActiveSessionsPerPlayer) {
            throw new BadRequestException("Too many active upload sessions for player");
        }
        long activeBytesForGame = uploadSessionRepository.sumTotalSizeByGameAndStatus(gameId, UploadSessionStatus.active);
        if (activeBytesForGame + totalSizeBytes > maxActiveBytesPerGame) {
            throw new BadRequestException("Game upload capacity exceeded, retry later");
        }

        String contentType = normalizeContentType(request.getContentType());
        fileStorageService.validateChunkedUploadMetadata(contentType, totalSizeBytes);

        int chunkSizeBytes = request.getChunkSizeBytes() != null ? request.getChunkSizeBytes() : defaultChunkSizeBytes;
        if (chunkSizeBytes <= 0 || chunkSizeBytes > maxChunkSizeBytes) {
            throw new BadRequestException("chunkSizeBytes must be between 1 and " + maxChunkSizeBytes);
        }

        long calculatedTotalChunks = (totalSizeBytes + chunkSizeBytes - 1L) / chunkSizeBytes;
        if (calculatedTotalChunks > Integer.MAX_VALUE) {
            throw new BadRequestException("total chunk count is too large");
        }

        UploadSession session = UploadSession.builder()
                .game(player.getTeam().getGame())
                .player(player)
                .originalFileName(request.getOriginalFileName())
                .contentType(contentType)
                .totalSizeBytes(totalSizeBytes)
                .chunkSizeBytes(chunkSizeBytes)
                .totalChunks((int) calculatedTotalChunks)
                .status(UploadSessionStatus.active)
                .expiresAt(Instant.now().plusSeconds(uploadSessionTtlSeconds))
                .build();
        session = uploadSessionRepository.save(session);
        ensureSessionDirectory(session.getId());
        meterRegistry.counter("uploads.sessions.created").increment();
        return buildResponse(session);
    }

    @Transactional(readOnly = true)
    public UploadSessionResponse getSession(UUID gameId, UUID sessionId, Player authPlayer) {
        UploadSession session = getAuthorizedSession(gameId, sessionId, authPlayer);
        return buildResponse(session);
    }

    @Transactional
    public UploadSessionResponse uploadChunk(
            UUID gameId,
            UUID sessionId,
            int chunkIndex,
            byte[] chunkBytes,
            Player authPlayer
    ) {
        UploadSession session = getAuthorizedSession(gameId, sessionId, authPlayer);
        if (session.getStatus() != UploadSessionStatus.active) {
            meterRegistry.counter("uploads.chunks.failed", "reason", "inactive_session").increment();
            throw new BadRequestException("Upload session is not active");
        }
        if (session.getExpiresAt().isBefore(Instant.now())) {
            session.setStatus(UploadSessionStatus.expired);
            uploadSessionRepository.save(session);
            cleanupSessionStorage(session.getId());
            meterRegistry.counter("uploads.chunks.failed", "reason", "session_expired").increment();
            throw new BadRequestException("Upload session has expired");
        }
        if (chunkIndex < 0 || chunkIndex >= session.getTotalChunks()) {
            meterRegistry.counter("uploads.chunks.failed", "reason", "invalid_chunk_index").increment();
            throw new BadRequestException("Invalid chunk index");
        }
        if (chunkBytes == null || chunkBytes.length == 0) {
            meterRegistry.counter("uploads.chunks.failed", "reason", "empty_chunk").increment();
            throw new BadRequestException("Chunk payload is empty");
        }

        int expectedChunkSize = expectedChunkSize(session, chunkIndex);
        if (chunkBytes.length != expectedChunkSize) {
            meterRegistry.counter("uploads.chunks.failed", "reason", "size_mismatch").increment();
            throw new BadRequestException("Chunk size mismatch for index " + chunkIndex);
        }

        Path chunkPath = chunkPathFor(session.getId(), chunkIndex);
        writeChunk(chunkPath, chunkBytes);
        uploadSessionChunkRepository.save(
                UploadSessionChunk.builder()
                        .sessionId(session.getId())
                        .chunkIndex(chunkIndex)
                        .chunkSizeBytes(chunkBytes.length)
                        .build()
        );
        session.setExpiresAt(Instant.now().plusSeconds(uploadSessionTtlSeconds));
        uploadSessionRepository.save(session);
        meterRegistry.counter("uploads.chunks.uploaded").increment();
        return buildResponse(session);
    }

    @Transactional
    public UploadSessionResponse completeSession(UUID gameId, UUID sessionId, Player authPlayer) {
        UploadSession session = getAuthorizedSession(gameId, sessionId, authPlayer);
        ensureGameIsLive(session.getPlayer());

        if (session.getStatus() == UploadSessionStatus.completed) {
            return buildResponse(session);
        }
        if (session.getStatus() != UploadSessionStatus.active) {
            throw new BadRequestException("Upload session is not active");
        }

        long uploadedCount = uploadSessionChunkRepository.countBySessionId(sessionId);
        if (uploadedCount != session.getTotalChunks()) {
            throw new BadRequestException("Not all chunks have been uploaded");
        }

        Path assembled = assembleChunks(session);
        String fileUrl = fileStorageService.storeAssembledUpload(
                assembled,
                session.getGame().getId(),
                session.getContentType(),
                session.getTotalSizeBytes()
        );

        session.setStatus(UploadSessionStatus.completed);
        session.setCompletedAt(Instant.now());
        session.setFileUrl(fileUrl);
        uploadSessionChunkRepository.deleteBySessionId(sessionId);
        uploadSessionRepository.save(session);
        cleanupSessionStorage(session.getId());
        meterRegistry.counter("uploads.sessions.completed").increment();
        return buildResponse(session);
    }

    @Transactional
    public void cancelSession(UUID gameId, UUID sessionId, Player authPlayer) {
        UploadSession session = getAuthorizedSession(gameId, sessionId, authPlayer);
        if (session.getStatus() == UploadSessionStatus.completed) {
            throw new BadRequestException("Completed uploads cannot be cancelled");
        }
        session.setStatus(UploadSessionStatus.cancelled);
        uploadSessionChunkRepository.deleteBySessionId(sessionId);
        uploadSessionRepository.save(session);
        cleanupSessionStorage(sessionId);
    }

    @Transactional
    public int expireStaleSessions() {
        List<UploadSession> stale = uploadSessionRepository.findByStatusAndExpiresAtBefore(
                UploadSessionStatus.active,
                Instant.now()
        );
        for (UploadSession session : stale) {
            session.setStatus(UploadSessionStatus.expired);
            uploadSessionChunkRepository.deleteBySessionId(session.getId());
            cleanupSessionStorage(session.getId());
        }
        uploadSessionRepository.saveAll(stale);
        if (!stale.isEmpty()) {
            meterRegistry.counter("uploads.sessions.expired").increment(stale.size());
        }
        return stale.size();
    }

    private UploadSession getAuthorizedSession(UUID gameId, UUID sessionId, Player authPlayer) {
        Player player = loadPlayer(authPlayer);
        UploadSession session = uploadSessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("UploadSession", sessionId));
        gameAccessService.ensurePlayerBelongsToGame(player, gameId);
        if (!session.getGame().getId().equals(gameId)) {
            throw new BadRequestException("Upload session does not belong to this game");
        }
        if (!session.getPlayer().getId().equals(player.getId())) {
            throw new BadRequestException("Upload session does not belong to the current player");
        }
        return session;
    }

    private Player loadPlayer(Player authPlayer) {
        UUID playerId = authPlayer.getId();
        Player player = playerRepository.findAuthPlayerById(playerId)
                .orElseThrow(() -> new ResourceNotFoundException("Player", playerId));
        // force required lazy proxies
        player.getTeam().getId();
        player.getTeam().getGame().getId();
        return player;
    }

    private void ensureGameIsLive(Player player) {
        if (player.getTeam().getGame().getStatus() != GameStatus.live) {
            throw new BadRequestException("Game is not active yet");
        }
    }

    private UploadSessionResponse buildResponse(UploadSession session) {
        List<Integer> uploadedChunks = session.getStatus() == UploadSessionStatus.completed
                ? IntStream.range(0, session.getTotalChunks()).boxed().toList()
                : uploadSessionChunkRepository.findUploadedChunkIndexes(session.getId());
        if (session.getStatus() == UploadSessionStatus.active && !uploadedChunks.isEmpty()) {
            meterRegistry.counter("uploads.sessions.resumed").increment();
        }
        return UploadSessionResponse.builder()
                .sessionId(session.getId())
                .gameId(session.getGame().getId())
                .contentType(session.getContentType())
                .totalSizeBytes(session.getTotalSizeBytes())
                .chunkSizeBytes(session.getChunkSizeBytes())
                .totalChunks(session.getTotalChunks())
                .uploadedChunks(uploadedChunks)
                .status(session.getStatus().name())
                .fileUrl(session.getFileUrl())
                .expiresAt(session.getExpiresAt())
                .build();
    }

    private Path chunkPathFor(UUID sessionId, int chunkIndex) {
        return sessionDirectory(sessionId).resolve("chunk-" + chunkIndex + ".part");
    }

    private Path sessionDirectory(UUID sessionId) {
        return chunkSessionsRoot().resolve(sessionId.toString());
    }

    private Path chunkSessionsRoot() {
        return Paths.get(uploadsPath).resolve("_chunk_sessions");
    }

    private void ensureSessionDirectory(UUID sessionId) {
        Path dir = sessionDirectory(sessionId);
        try {
            Files.createDirectories(dir);
        } catch (IOException e) {
            throw new RuntimeException("Could not create upload session directory", e);
        }
    }

    private void writeChunk(Path chunkPath, byte[] chunkBytes) {
        try {
            Files.createDirectories(chunkPath.getParent());
            Files.write(chunkPath, chunkBytes, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        } catch (IOException e) {
            throw new RuntimeException("Failed to store upload chunk", e);
        }
    }

    private int expectedChunkSize(UploadSession session, int chunkIndex) {
        if (chunkIndex < session.getTotalChunks() - 1) {
            return session.getChunkSizeBytes();
        }
        long consumed = (long) session.getChunkSizeBytes() * (session.getTotalChunks() - 1L);
        return (int) (session.getTotalSizeBytes() - consumed);
    }

    private Path assembleChunks(UploadSession session) {
        Path assembledPath = sessionDirectory(session.getId()).resolve("assembled.upload");
        try (OutputStream outputStream = Files.newOutputStream(
                assembledPath,
                StandardOpenOption.CREATE,
                StandardOpenOption.TRUNCATE_EXISTING
        )) {
            for (int i = 0; i < session.getTotalChunks(); i++) {
                Path chunkPath = chunkPathFor(session.getId(), i);
                if (!Files.exists(chunkPath)) {
                    throw new BadRequestException("Missing chunk " + i + " for completion");
                }
                Files.copy(chunkPath, outputStream);
            }
        } catch (IOException e) {
            throw new RuntimeException("Failed to assemble uploaded chunks", e);
        }
        return assembledPath;
    }

    private void cleanupSessionStorage(UUID sessionId) {
        Path root = sessionDirectory(sessionId);
        if (!Files.exists(root)) {
            return;
        }
        try (var files = Files.walk(root)) {
            List<Path> paths = new ArrayList<>();
            files.forEach(paths::add);
            paths.sort((a, b) -> b.getNameCount() - a.getNameCount());
            for (Path path : paths) {
                Files.deleteIfExists(path);
            }
        } catch (IOException e) {
            log.warn("Failed to clean session chunk directory for {}: {}", sessionId, e.getMessage());
        }
    }

    private String normalizeContentType(String contentType) {
        return contentType == null ? "" : contentType.trim().toLowerCase();
    }
}
