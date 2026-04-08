package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.UploadSessionInitRequest;
import com.prayer.pointfinder.dto.response.UploadSessionClearResponse;
import com.prayer.pointfinder.dto.response.UploadSessionResponse;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.UploadSession;
import com.prayer.pointfinder.entity.UploadSessionChunk;
import com.prayer.pointfinder.entity.UploadSessionStatus;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.FileStorageException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.exception.UploadSessionException;
import com.prayer.pointfinder.repository.PlayerRepository;
import com.prayer.pointfinder.repository.UploadSessionChunkRepository;
import com.prayer.pointfinder.repository.UploadSessionRepository;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
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
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;

@Service
@RequiredArgsConstructor
@Slf4j
public class ChunkedUploadService {

    private static final int RECOVERABLE_SESSION_LIMIT = 100;
    private static final List<UploadSessionStatus> RECOVERABLE_MEDIA_ITEM_STATUSES =
            List.of(UploadSessionStatus.active, UploadSessionStatus.completed);
    private static final List<UploadSessionStatus> CLEARABLE_SESSION_STATUSES =
            List.of(UploadSessionStatus.active, UploadSessionStatus.expired, UploadSessionStatus.cancelled);

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

    @Transactional(timeout = 10)
    public UploadSessionResponse createSession(UUID gameId, Player authPlayer, UploadSessionInitRequest request) {
        if (!chunkedUploadEnabled) {
            throw retryable(HttpStatus.BAD_REQUEST, "UPLOADS_DISABLED",
                    "Chunked uploads are temporarily disabled");
        }
        Player player = loadPlayer(authPlayer);
        gameAccessService.ensurePlayerBelongsToGame(player, gameId);
        ensureGameIsLive(player);

        Instant now = Instant.now();
        expireStaleSessionsForPlayerInGame(gameId, player.getId(), now);
        SessionMetadata metadata = validateSessionMetadata(request);

        if (metadata.mediaItemKey() != null) {
            var existing = findRecoverableSessionByMediaItemKey(gameId, player.getId(), metadata.mediaItemKey());
            if (existing.isPresent()) {
                UploadSession session = existing.get();
                if (!expireSessionIfStale(session, now)) {
                    assertCompatibleMediaItem(session, metadata);
                    return buildResponse(session);
                }
            }
        }

        long playerActiveSessions = uploadSessionRepository.countActiveSessionsByPlayerId(
                player.getId(),
                UploadSessionStatus.active,
                now
        );
        if (playerActiveSessions >= maxActiveSessionsPerPlayer) {
            throw retryable(HttpStatus.BAD_REQUEST, "UPLOAD_SESSION_LIMIT",
                    "Too many active upload sessions for player");
        }
        long activeBytesForGame = uploadSessionRepository.sumActiveBytesByGame(
                gameId,
                UploadSessionStatus.active,
                now
        );
        if (activeBytesForGame + metadata.totalSizeBytes() > maxActiveBytesPerGame) {
            throw retryable(HttpStatus.BAD_REQUEST, "UPLOAD_GAME_CAPACITY",
                    "Game upload capacity exceeded, retry later");
        }

        UploadSession session = UploadSession.builder()
                .game(player.getTeam().getGame())
                .player(player)
                .originalFileName(metadata.originalFileName())
                .mediaItemKey(metadata.mediaItemKey())
                .contentType(metadata.contentType())
                .totalSizeBytes(metadata.totalSizeBytes())
                .chunkSizeBytes(metadata.chunkSizeBytes())
                .totalChunks(metadata.totalChunks())
                .status(UploadSessionStatus.active)
                .expiresAt(now.plusSeconds(uploadSessionTtlSeconds))
                .build();
        session = uploadSessionRepository.save(session);
        if (metadata.mediaItemKey() != null) {
            uploadSessionRepository.flush();
        }
        ensureSessionDirectory(session.getId());
        meterRegistry.counter("uploads.sessions.created").increment();
        return buildResponse(session);
    }

    @Transactional(timeout = 10)
    public UploadSessionResponse getSession(UUID gameId, UUID sessionId, Player authPlayer) {
        UploadSession session = getAuthorizedSession(gameId, sessionId, authPlayer);
        expireSessionIfStale(session, Instant.now());
        return buildResponse(session);
    }

    @Transactional(timeout = 10)
    public List<UploadSessionResponse> listRecoverableSessions(UUID gameId, Player authPlayer) {
        Player player = loadPlayer(authPlayer);
        gameAccessService.ensurePlayerBelongsToGame(player, gameId);
        Instant now = Instant.now();
        expireStaleSessionsForPlayerInGame(gameId, player.getId(), now);
        return uploadSessionRepository.findRecoverableSessionsForPlayerInGame(
                        gameId,
                        player.getId(),
                        UploadSessionStatus.active,
                        UploadSessionStatus.completed,
                        now,
                        PageRequest.of(0, RECOVERABLE_SESSION_LIMIT)
                )
                .stream()
                .map(this::buildResponse)
                .toList();
    }

    @Transactional(timeout = 10)
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
            throw sessionNotActive(session);
        }
        Instant now = Instant.now();
        if (expireSessionIfStale(session, now)) {
            meterRegistry.counter("uploads.chunks.failed", "reason", "session_expired").increment();
            throw retryable(HttpStatus.BAD_REQUEST, "UPLOAD_SESSION_EXPIRED",
                    "Upload session has expired");
        }
        if (chunkIndex < 0 || chunkIndex >= session.getTotalChunks()) {
            meterRegistry.counter("uploads.chunks.failed", "reason", "invalid_chunk_index").increment();
            throw permanent(HttpStatus.BAD_REQUEST, "UPLOAD_INVALID_CHUNK_INDEX", "Invalid chunk index");
        }
        if (chunkBytes == null || chunkBytes.length == 0) {
            meterRegistry.counter("uploads.chunks.failed", "reason", "empty_chunk").increment();
            throw permanent(HttpStatus.BAD_REQUEST, "UPLOAD_EMPTY_CHUNK", "Chunk payload is empty");
        }

        int expectedChunkSize = expectedChunkSize(session, chunkIndex);
        if (chunkBytes.length != expectedChunkSize) {
            meterRegistry.counter("uploads.chunks.failed", "reason", "size_mismatch").increment();
            throw permanent(HttpStatus.BAD_REQUEST, "UPLOAD_CHUNK_SIZE_MISMATCH",
                    "Chunk size mismatch for index " + chunkIndex);
        }

        boolean chunkExists = uploadSessionChunkRepository.existsBySessionIdAndChunkIndex(
                session.getId(), chunkIndex
        );
        Path chunkPath = chunkPathFor(session.getId(), chunkIndex);
        if (chunkExists && Files.exists(chunkPath)) {
            log.debug("Chunk {} already uploaded for session {}, skipping", chunkIndex, sessionId);
        } else {
            if (chunkExists) {
                uploadSessionChunkRepository.deleteBySessionIdAndChunkIndex(session.getId(), chunkIndex);
                meterRegistry.counter("uploads.chunks.recovered_missing_file").increment();
            }
            writeChunk(chunkPath, chunkBytes);
            uploadSessionChunkRepository.save(
                    UploadSessionChunk.builder()
                            .sessionId(session.getId())
                            .chunkIndex(chunkIndex)
                            .chunkSizeBytes(chunkBytes.length)
                            .build()
            );
            meterRegistry.counter("uploads.chunks.uploaded").increment();
        }
        session.setExpiresAt(now.plusSeconds(uploadSessionTtlSeconds));
        uploadSessionRepository.save(session);
        return buildResponse(session);
    }

    @Transactional(timeout = 60)
    public UploadSessionResponse completeSession(UUID gameId, UUID sessionId, Player authPlayer) {
        UploadSession session = getAuthorizedSession(gameId, sessionId, authPlayer);
        ensureGameIsLive(session.getPlayer());

        if (session.getStatus() == UploadSessionStatus.completed) {
            return buildResponse(session);
        }
        if (session.getStatus() != UploadSessionStatus.active) {
            throw sessionNotActive(session);
        }
        if (expireSessionIfStale(session, Instant.now())) {
            throw retryable(HttpStatus.BAD_REQUEST, "UPLOAD_SESSION_EXPIRED",
                    "Upload session has expired");
        }

        long uploadedCount = uploadSessionChunkRepository.countBySessionId(sessionId);
        if (uploadedCount != session.getTotalChunks()) {
            throw retryable(HttpStatus.BAD_REQUEST, "UPLOAD_INCOMPLETE",
                    "Not all chunks have been uploaded");
        }
        List<Integer> missingChunkFiles = findUploadedChunksWithMissingFiles(session);
        if (!missingChunkFiles.isEmpty()) {
            missingChunkFiles.forEach(chunkIndex ->
                    uploadSessionChunkRepository.deleteBySessionIdAndChunkIndex(sessionId, chunkIndex)
            );
            meterRegistry.counter("uploads.chunks.recovered_missing_file").increment(missingChunkFiles.size());
            throw retryable(HttpStatus.BAD_REQUEST, "UPLOAD_INCOMPLETE",
                    "Uploaded chunk data is incomplete; retry missing chunks");
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

    @Transactional(timeout = 10)
    public void cancelSession(UUID gameId, UUID sessionId, Player authPlayer) {
        UploadSession session = getAuthorizedSession(gameId, sessionId, authPlayer);
        if (session.getStatus() == UploadSessionStatus.completed) {
            throw permanent(HttpStatus.BAD_REQUEST, "UPLOAD_COMPLETED_CANNOT_CANCEL",
                    "Completed uploads cannot be cancelled");
        }
        session.setStatus(UploadSessionStatus.cancelled);
        uploadSessionChunkRepository.deleteBySessionId(sessionId);
        uploadSessionRepository.save(session);
        cleanupSessionStorage(sessionId);
    }

    @Transactional(timeout = 10)
    public UploadSessionClearResponse clearAbandonedSessions(UUID gameId, Player authPlayer, String mediaItemKey) {
        Player player = loadPlayer(authPlayer);
        gameAccessService.ensurePlayerBelongsToGame(player, gameId);

        int cancelledSessions = 0;
        List<UploadSession> sessions = uploadSessionRepository.findClearableSessionsForPlayerInGame(
                gameId,
                player.getId(),
                normalizeMediaItemKey(mediaItemKey),
                CLEARABLE_SESSION_STATUSES
        );
        for (UploadSession session : sessions) {
            if (session.getStatus() == UploadSessionStatus.active) {
                session.setStatus(UploadSessionStatus.cancelled);
                cancelledSessions++;
            }
            uploadSessionChunkRepository.deleteBySessionId(session.getId());
            cleanupSessionStorage(session.getId());
        }
        uploadSessionRepository.saveAll(sessions);
        if (!sessions.isEmpty()) {
            meterRegistry.counter("uploads.sessions.cleared").increment(sessions.size());
        }
        return UploadSessionClearResponse.builder()
                .cancelledSessions(cancelledSessions)
                .clearedSessions(sessions.size())
                .build();
    }

    @Transactional(timeout = 10)
    public int expireStaleSessions() {
        List<UploadSession> stale = uploadSessionRepository.findByStatusAndExpiresAtBefore(
                UploadSessionStatus.active,
                Instant.now()
        );
        for (UploadSession session : stale) {
            expireSession(session);
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

    private SessionMetadata validateSessionMetadata(UploadSessionInitRequest request) {
        long totalSizeBytes = request.getTotalSizeBytes() != null ? request.getTotalSizeBytes() : 0L;
        if (totalSizeBytes <= 0) {
            throw permanent(HttpStatus.BAD_REQUEST, "UPLOAD_INVALID_METADATA", "totalSizeBytes must be positive");
        }
        if (totalSizeBytes > fileStorageService.maxFileSizeBytes()) {
            throw permanent(HttpStatus.BAD_REQUEST, "UPLOAD_FILE_TOO_LARGE", "File size exceeds allowed limit");
        }

        String contentType = normalizeContentType(request.getContentType());
        if (contentType.isBlank()) {
            throw permanent(HttpStatus.BAD_REQUEST, "UPLOAD_INVALID_METADATA", "contentType is required");
        }
        try {
            fileStorageService.validateChunkedUploadMetadata(contentType, totalSizeBytes);
        } catch (BadRequestException ex) {
            throw permanent(HttpStatus.BAD_REQUEST, "UPLOAD_INVALID_METADATA", ex.getMessage());
        }

        int chunkSizeBytes = request.getChunkSizeBytes() != null ? request.getChunkSizeBytes() : defaultChunkSizeBytes;
        if (chunkSizeBytes <= 0 || chunkSizeBytes > maxChunkSizeBytes) {
            throw permanent(HttpStatus.BAD_REQUEST, "UPLOAD_INVALID_METADATA",
                    "chunkSizeBytes must be between 1 and " + maxChunkSizeBytes);
        }

        long calculatedTotalChunks = (totalSizeBytes + chunkSizeBytes - 1L) / chunkSizeBytes;
        if (calculatedTotalChunks > Integer.MAX_VALUE) {
            throw permanent(HttpStatus.BAD_REQUEST, "UPLOAD_INVALID_METADATA", "total chunk count is too large");
        }

        return new SessionMetadata(
                request.getOriginalFileName(),
                normalizeMediaItemKey(request.getMediaItemKey()),
                contentType,
                totalSizeBytes,
                chunkSizeBytes,
                (int) calculatedTotalChunks
        );
    }

    private Optional<UploadSession> findRecoverableSessionByMediaItemKey(
            UUID gameId,
            UUID playerId,
            String mediaItemKey
    ) {
        return uploadSessionRepository.findRecoverableSessionsByMediaItemKey(
                        gameId,
                        playerId,
                        mediaItemKey,
                        RECOVERABLE_MEDIA_ITEM_STATUSES,
                        PageRequest.of(0, 1)
                )
                .stream()
                .findFirst();
    }

    private void assertCompatibleMediaItem(UploadSession session, SessionMetadata metadata) {
        boolean sameFile = Objects.equals(session.getContentType(), metadata.contentType())
                && session.getTotalSizeBytes() == metadata.totalSizeBytes();
        boolean compatible = sameFile
                && (session.getStatus() == UploadSessionStatus.completed
                    || (session.getChunkSizeBytes() == metadata.chunkSizeBytes()
                        && session.getTotalChunks() == metadata.totalChunks()));
        if (!compatible) {
            throw permanent(HttpStatus.CONFLICT, "UPLOAD_MEDIA_ITEM_KEY_CONFLICT",
                    "mediaItemKey already belongs to different upload metadata");
        }
    }

    private int expireStaleSessionsForPlayerInGame(UUID gameId, UUID playerId, Instant now) {
        List<UploadSession> stale = uploadSessionRepository.findExpiredActiveSessionsForPlayerInGame(
                gameId,
                playerId,
                UploadSessionStatus.active,
                now
        );
        for (UploadSession session : stale) {
            expireSession(session);
        }
        uploadSessionRepository.saveAll(stale);
        if (!stale.isEmpty()) {
            uploadSessionRepository.flush();
            meterRegistry.counter("uploads.sessions.expired").increment(stale.size());
        }
        return stale.size();
    }

    private boolean expireSessionIfStale(UploadSession session, Instant now) {
        if (session.getStatus() != UploadSessionStatus.active || session.getExpiresAt().isAfter(now)) {
            return false;
        }
        expireSession(session);
        uploadSessionRepository.save(session);
        uploadSessionRepository.flush();
        meterRegistry.counter("uploads.sessions.expired").increment();
        return true;
    }

    private void expireSession(UploadSession session) {
        session.setStatus(UploadSessionStatus.expired);
        uploadSessionChunkRepository.deleteBySessionId(session.getId());
        cleanupSessionStorage(session.getId());
    private UploadSessionException sessionNotActive(UploadSession session) {
        if (session.getStatus() == UploadSessionStatus.expired) {
            return retryable(HttpStatus.BAD_REQUEST, "UPLOAD_SESSION_EXPIRED", "Upload session has expired");
        }
        return permanent(HttpStatus.BAD_REQUEST, "UPLOAD_SESSION_NOT_ACTIVE", "Upload session is not active");
    }

    private List<Integer> findUploadedChunksWithMissingFiles(UploadSession session) {
        return uploadSessionChunkRepository.findUploadedChunkIndexes(session.getId()).stream()
                .filter(chunkIndex -> !Files.exists(chunkPathFor(session.getId(), chunkIndex)))
                .toList();
    }

    private UploadSessionException permanent(HttpStatus status, String code, String message) {
        return UploadSessionException.permanent(status, code, message);
    }

    private UploadSessionException retryable(HttpStatus status, String code, String message) {
        return UploadSessionException.retryable(status, code, message);
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
                .mediaItemKey(session.getMediaItemKey())
                .originalFileName(session.getOriginalFileName())
                .contentType(session.getContentType())
                .totalSizeBytes(session.getTotalSizeBytes())
                .chunkSizeBytes(session.getChunkSizeBytes())
                .totalChunks(session.getTotalChunks())
                .uploadedChunks(uploadedChunks)
                .status(session.getStatus().name())
                .fileUrl(session.getFileUrl())
                .expiresAt(session.getExpiresAt())
                .createdAt(session.getCreatedAt())
                .updatedAt(session.getUpdatedAt())
                .completedAt(session.getCompletedAt())
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
            throw new FileStorageException("Could not create upload session directory", e);
        }
    }

    private void writeChunk(Path chunkPath, byte[] chunkBytes) {
        try {
            Files.createDirectories(chunkPath.getParent());
            Files.write(chunkPath, chunkBytes, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        } catch (IOException e) {
            throw new FileStorageException("Failed to store upload chunk", e);
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
                    uploadSessionChunkRepository.deleteBySessionIdAndChunkIndex(session.getId(), i);
                    throw retryable(HttpStatus.BAD_REQUEST, "UPLOAD_INCOMPLETE",
                            "Uploaded chunk data is incomplete; retry missing chunks");
                }
                Files.copy(chunkPath, outputStream);
            }
        } catch (IOException e) {
            throw new FileStorageException("Failed to assemble uploaded chunks", e);
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

    private String normalizeMediaItemKey(String mediaItemKey) {
        if (mediaItemKey == null) {
            return null;
        }
        String normalized = mediaItemKey.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private record SessionMetadata(
            String originalFileName,
            String mediaItemKey,
            String contentType,
            long totalSizeBytes,
            int chunkSizeBytes,
            int totalChunks
    ) {}
}
