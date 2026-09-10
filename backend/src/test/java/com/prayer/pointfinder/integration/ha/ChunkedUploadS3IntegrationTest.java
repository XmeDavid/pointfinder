package com.prayer.pointfinder.integration.ha;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.config.ChunkedUploadProperties;
import com.prayer.pointfinder.dto.request.UploadSessionInitRequest;
import com.prayer.pointfinder.dto.response.UploadSessionResponse;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.UploadSession;
import com.prayer.pointfinder.entity.UploadSessionStatus;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.UploadSessionException;
import com.prayer.pointfinder.repository.UploadSessionChunkRepository;
import com.prayer.pointfinder.repository.UploadSessionRepository;
import com.prayer.pointfinder.service.ApnsPushService;
import com.prayer.pointfinder.service.ChunkedUploadService;
import com.prayer.pointfinder.service.FcmPushService;
import com.prayer.pointfinder.service.FileStorageService;
import com.prayer.pointfinder.service.GameAccessService;
import com.prayer.pointfinder.service.ObjectStorageService;
import com.prayer.pointfinder.service.QuotaService;
import com.prayer.pointfinder.service.ThumbnailService;
import com.prayer.pointfinder.service.upload.S3ChunkStore;
import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.MinIOContainer;
import org.testcontainers.junit.jupiter.Container;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.BucketAlreadyOwnedByYouException;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Chunked uploads with object storage (MinIO) as the chunk store. "node-a"
 * is the Spring-managed service; "node-b" is a second service object over
 * the same repositories and bucket, driven inside its own transactions, as
 * a second process would be. No local upload volume is shared.
 */
class ChunkedUploadS3IntegrationTest extends IntegrationTestBase {

    private static final String BUCKET = "pointfinder-ha-test";

    @Container
    static MinIOContainer minio = new MinIOContainer("minio/minio:RELEASE.2023-09-04T19-57-37Z");

    static final Path TEMP_ROOT = Paths.get(System.getProperty("java.io.tmpdir"), "pointfinder-ha-assembly-" + UUID.randomUUID());

    @DynamicPropertySource
    static void objectStorage(DynamicPropertyRegistry registry) {
        registry.add("app.storage.type", () -> "s3");
        registry.add("app.storage.s3.endpoint", minio::getS3URL);
        registry.add("app.storage.s3.region", () -> "us-east-1");
        registry.add("app.storage.s3.bucket", () -> BUCKET);
        registry.add("app.storage.s3.access-key", minio::getUserName);
        registry.add("app.storage.s3.secret-key", minio::getPassword);
        registry.add("app.uploads.temp-path", TEMP_ROOT::toString);
        registry.add("app.uploads.chunk.default-size-bytes", () -> "64");
    }

    @Autowired private ChunkedUploadService nodeA;
    @Autowired private ObjectStorageService objectStorage;
    @Autowired private S3Client s3Client;
    @Autowired private ThumbnailService thumbnailService;
    @Autowired private UploadSessionRepository uploadSessionRepository;
    @Autowired private com.prayer.pointfinder.repository.PlayerPushTokenRepository playerPushTokenRepository;
    @Autowired private UploadSessionChunkRepository uploadSessionChunkRepository;
    @Autowired private GameAccessService gameAccessService;
    @Autowired private FileStorageService fileStorageService;
    @Autowired private MeterRegistry meterRegistry;
    @Autowired private ApnsPushService apnsPushService;
    @Autowired private FcmPushService fcmPushService;
    @Autowired private ChunkedUploadProperties uploadProps;
    @Autowired private QuotaService quotaService;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private jakarta.persistence.EntityManager entityManager;

    private TransactionTemplate tx;
    private ChunkedUploadService nodeB;
    private Game game;
    private Player player;
    private Player authPlayer;
    private Player otherTeamPlayer;
    private byte[] image;

    @BeforeEach
    void setUpBucketAndGame() throws IOException {
        try {
            s3Client.createBucket(CreateBucketRequest.builder().bucket(BUCKET).build());
        } catch (BucketAlreadyOwnedByYouException ignored) {
            // created by an earlier test
        }
        tx = new TransactionTemplate(transactionManager);
        nodeB = newInstance();

        User operator = createOperator("uploads-" + UUID.randomUUID() + "@ha.test", "password123");
        game = createGame(operator, "Uploads", GameStatus.live);
        Team team = createTeam(game, "Wolves", "WOLF01");
        player = createPlayer(team, "Ana", "device-ana");
        authPlayer = Player.builder().id(player.getId()).build();
        Team other = createTeam(game, "Foxes", "FOX001");
        otherTeamPlayer = Player.builder().id(createPlayer(other, "Bea", "device-bea").getId()).build();
        image = png(120, 90);
        assertTrue(image.length > 200, "image large enough to need several 64-byte chunks");
    }

    /** A fresh service object: what a restarted or second process would hold (nothing in memory). */
    private ChunkedUploadService newInstance() {
        return new ChunkedUploadService(
                uploadSessionRepository, uploadSessionChunkRepository, new S3ChunkStore(objectStorage),
                entityManager, playerRepository, playerPushTokenRepository, gameAccessService, fileStorageService, meterRegistry,
                apnsPushService, fcmPushService, uploadProps, quotaService);
    }

    private <T> T onB(ChunkedUploadService instance, Callable<T> call) {
        return tx.execute(status -> {
            try {
                return call.call();
            } catch (RuntimeException e) {
                throw e;
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        });
    }

    private UploadSessionResponse createSession(String mediaItemKey) {
        UploadSessionInitRequest request = new UploadSessionInitRequest();
        request.setOriginalFileName("photo.png");
        request.setMediaItemKey(mediaItemKey);
        request.setContentType("image/png");
        request.setTotalSizeBytes((long) image.length);
        request.setChunkSizeBytes(64);
        return nodeA.createSession(game.getId(), authPlayer, request);
    }

    private byte[] chunk(int index) {
        int from = index * 64;
        return Arrays.copyOfRange(image, from, Math.min(from + 64, image.length));
    }

    private String filenameOf(String fileUrl) {
        return fileUrl.substring(fileUrl.lastIndexOf('/') + 1);
    }

    @Test
    void chunksAcceptedOnEitherInstanceCompleteOnTheOtherAfterARestart() throws Exception {
        UploadSessionResponse session = createSession("m-1");
        UUID id = session.sessionId();
        int total = session.totalChunks();
        assertTrue(total >= 3);

        // even chunks on A, odd chunks on B
        for (int i = 0; i < total; i++) {
            final int index = i;
            if (i % 2 == 0) {
                nodeA.uploadChunk(game.getId(), id, index, chunk(index), authPlayer);
            } else {
                onB(nodeB, () -> nodeB.uploadChunk(game.getId(), id, index, chunk(index), authPlayer));
            }
        }
        // "restart A": nothing survives in memory, only the database and the bucket
        ChunkedUploadService restartedA = newInstance();

        UploadSessionResponse completed = onB(nodeB, () -> nodeB.completeSession(game.getId(), id, authPlayer));
        assertEquals(UploadSessionStatus.completed.name(), completed.status());
        assertNotNull(completed.fileUrl());

        String key = game.getId() + "/" + filenameOf(completed.fileUrl());
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        objectStorage.downloadTo(key, bytes);
        assertArrayEquals(image, bytes.toByteArray(), "final object is the exact original bytes");
        assertTrue(objectStorage.listKeys("chunk-sessions/" + id + "/").isEmpty(), "chunk objects removed");
        assertEquals(0, uploadSessionChunkRepository.countBySessionId(id));

        // duplicate completion on the restarted instance: same answer, no second object
        UploadSessionResponse again = onB(restartedA, () -> restartedA.completeSession(game.getId(), id, authPlayer));
        assertEquals(completed.fileUrl(), again.fileUrl());
        assertEquals(1, objectStorage.listKeys(game.getId() + "/").size());
        assertNoTempFilesLeft();
    }

    @Test
    void duplicateChunkOnBothInstancesIsIdempotent() {
        UploadSessionResponse session = createSession("m-dup");
        UUID id = session.sessionId();
        nodeA.uploadChunk(game.getId(), id, 0, chunk(0), authPlayer);
        UploadSessionResponse afterB = onB(nodeB, () -> nodeB.uploadChunk(game.getId(), id, 0, chunk(0), authPlayer));
        assertEquals(List.of(0), afterB.uploadedChunks());
        assertEquals(1, uploadSessionChunkRepository.countBySessionId(id));
        assertEquals(1, objectStorage.listKeys("chunk-sessions/" + id + "/").size());
    }

    @Test
    void concurrentCompletionOnBothInstancesStoresOneObject() throws Exception {
        UploadSessionResponse session = createSession("m-race");
        UUID id = session.sessionId();
        for (int i = 0; i < session.totalChunks(); i++) {
            nodeA.uploadChunk(game.getId(), id, i, chunk(i), authPlayer);
        }
        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<UploadSessionResponse> a = pool.submit(() -> { go.await(); return nodeA.completeSession(game.getId(), id, authPlayer); });
            Future<UploadSessionResponse> b = pool.submit(() -> { go.await(); return onB(nodeB, () -> nodeB.completeSession(game.getId(), id, authPlayer)); });
            go.countDown();
            UploadSessionResponse ra = a.get(60, TimeUnit.SECONDS);
            UploadSessionResponse rb = b.get(60, TimeUnit.SECONDS);
            assertEquals(ra.fileUrl(), rb.fileUrl(), "both completions report the same stored file");
        } finally {
            pool.shutdownNow();
        }
        assertEquals(1, objectStorage.listKeys(game.getId() + "/").size(), "exactly one media object");
        assertTrue(objectStorage.listKeys("chunk-sessions/" + id + "/").isEmpty());
        assertNoTempFilesLeft();
    }

    @Test
    void expirySweepSkipsASessionBeingCompletedAndExpiresItAfterwardsOnlyIfStillActive() throws Exception {
        UploadSessionResponse session = createSession("m-sweep");
        UUID id = session.sessionId();
        for (int i = 0; i < session.totalChunks(); i++) {
            nodeA.uploadChunk(game.getId(), id, i, chunk(i), authPlayer);
        }
        tx.executeWithoutResult(status -> {
            UploadSession s = uploadSessionRepository.findById(id).orElseThrow();
            s.setExpiresAt(java.time.Instant.now().minusSeconds(3600));
            uploadSessionRepository.save(s);
        });

        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        Thread completing = new Thread(() -> tx.executeWithoutResult(status -> {
            uploadSessionRepository.findByIdForUpdate(id).orElseThrow();
            locked.countDown();
            try {
                release.await(30, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }), "holding-completion-lock");
        completing.start();
        assertTrue(locked.await(10, TimeUnit.SECONDS));

        assertEquals(0, onB(nodeB, () -> nodeB.expireStaleSessions()), "sweep skips the locked session");
        release.countDown();
        completing.join(30_000);

        assertEquals(1, onB(nodeB, () -> nodeB.expireStaleSessions()), "once unlocked and still active, it expires");
        assertTrue(objectStorage.listKeys("chunk-sessions/" + id + "/").isEmpty(), "expiry removed the chunk objects");
        UploadSessionException ex = assertThrows(UploadSessionException.class,
                () -> nodeA.completeSession(game.getId(), id, authPlayer));
        assertEquals("UPLOAD_SESSION_EXPIRED", ex.getCode());
        assertEquals(0, onB(nodeB, () -> nodeB.expireStaleSessions()), "nothing left to expire");
    }

    @Test
    void completedSessionIsNeverExpiredBySweep() {
        UploadSessionResponse session = createSession("m-done");
        UUID id = session.sessionId();
        for (int i = 0; i < session.totalChunks(); i++) {
            nodeA.uploadChunk(game.getId(), id, i, chunk(i), authPlayer);
        }
        nodeA.completeSession(game.getId(), id, authPlayer);
        tx.executeWithoutResult(status -> {
            UploadSession s = uploadSessionRepository.findById(id).orElseThrow();
            s.setExpiresAt(java.time.Instant.now().minusSeconds(3600));
            uploadSessionRepository.save(s);
        });
        assertEquals(0, onB(nodeB, () -> nodeB.expireStaleSessions()));
        assertEquals(UploadSessionStatus.completed, uploadSessionRepository.findById(id).orElseThrow().getStatus());
    }

    @Test
    void anotherTeamsPlayerIsRejectedOnEitherInstance() {
        UploadSessionResponse session = createSession("m-auth");
        UUID id = session.sessionId();
        assertThrows(BadRequestException.class,
                () -> nodeA.uploadChunk(game.getId(), id, 0, chunk(0), otherTeamPlayer));
        assertThrows(BadRequestException.class,
                () -> onB(nodeB, () -> nodeB.completeSession(game.getId(), id, otherTeamPlayer)));
    }

    @Test
    void orphanSweepRemovesChunkObjectsOfForgottenSessionsOnly() {
        UploadSessionResponse active = createSession("m-active");
        nodeA.uploadChunk(game.getId(), active.sessionId(), 0, chunk(0), authPlayer);
        UUID forgotten = UUID.randomUUID();
        objectStorage.upload("chunk-sessions/" + forgotten + "/chunk-0.part", new byte[] {1, 2, 3}, "application/octet-stream");

        int removed = onB(nodeB, () -> nodeB.sweepOrphanChunkStorage());
        assertTrue(removed >= 1);
        assertTrue(objectStorage.listKeys("chunk-sessions/" + forgotten + "/").isEmpty());
        assertEquals(1, objectStorage.listKeys("chunk-sessions/" + active.sessionId() + "/").size(), "active session untouched");
    }

    @Test
    void thumbnailIsRenderedFromAndStoredToObjectStorageWithoutLeavingTempFiles() throws Exception {
        String filename = UUID.randomUUID() + ".png";
        objectStorage.upload(game.getId() + "/" + filename, png(800, 600), "image/png");

        String thumbKey = thumbnailService.generateThumbnailInObjectStorage(game.getId(), filename);
        assertEquals(game.getId() + "/" + filename.replace(".png", "_thumb.jpg"), thumbKey);
        assertTrue(objectStorage.exists(thumbKey));
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        objectStorage.downloadTo(thumbKey, out);
        BufferedImage thumb = ImageIO.read(new java.io.ByteArrayInputStream(out.toByteArray()));
        assertEquals(400, thumb.getWidth());
        assertNoTempFilesLeft();

        // idempotent: a second call finds the existing thumbnail
        assertEquals(thumbKey, thumbnailService.generateThumbnailInObjectStorage(game.getId(), filename));
        // video and missing sources are skipped, not errors
        assertEquals(null, thumbnailService.generateThumbnailInObjectStorage(game.getId(), "clip.mp4"));
        assertEquals(null, thumbnailService.generateThumbnailInObjectStorage(game.getId(), "missing.png"));
    }

    @Test
    void rolledBackCompletionKeepsChunksAndARetryStoresTheSameObject() {
        UploadSessionResponse session = createSession("m-rollback");
        UUID id = session.sessionId();
        for (int i = 0; i < session.totalChunks(); i++) {
            nodeA.uploadChunk(game.getId(), id, i, chunk(i), authPlayer);
        }
        int chunkObjects = objectStorage.listKeys("chunk-sessions/" + id + "/").size();
        assertEquals(session.totalChunks(), chunkObjects);

        tx.executeWithoutResult(status -> {
            nodeB.completeSession(game.getId(), id, authPlayer);
            status.setRollbackOnly();
        });
        assertEquals(UploadSessionStatus.active, uploadSessionRepository.findById(id).orElseThrow().getStatus());
        assertEquals(chunkObjects, objectStorage.listKeys("chunk-sessions/" + id + "/").size(),
                "chunk bytes survive a rolled-back completion");
        assertEquals(session.totalChunks(), uploadSessionChunkRepository.countBySessionId(id));

        UploadSessionResponse completed = nodeA.completeSession(game.getId(), id, authPlayer);
        assertEquals(id + ".png", filenameOf(completed.fileUrl()), "final object key derives from the session id");
        assertEquals(1, objectStorage.listKeys(game.getId() + "/").size(), "the retry overwrote the same object");
        assertTrue(objectStorage.listKeys("chunk-sessions/" + id + "/").isEmpty());
    }

    @Test
    void chunkUploadAfterCompletionIsRejectedAndDoesNotResurrectChunkRows() {
        UploadSessionResponse session = createSession("m-late-chunk");
        UUID id = session.sessionId();
        for (int i = 0; i < session.totalChunks(); i++) {
            nodeA.uploadChunk(game.getId(), id, i, chunk(i), authPlayer);
        }
        nodeA.completeSession(game.getId(), id, authPlayer);
        UploadSessionException ex = assertThrows(UploadSessionException.class,
                () -> onB(nodeB, () -> nodeB.uploadChunk(game.getId(), id, 0, chunk(0), authPlayer)));
        assertEquals("UPLOAD_SESSION_NOT_ACTIVE", ex.getCode());
        assertEquals(0, uploadSessionChunkRepository.countBySessionId(id));
        assertEquals(UploadSessionStatus.completed, uploadSessionRepository.findById(id).orElseThrow().getStatus());
    }

    @Test
    void orphanSweepCursorAdvancesAcrossCallsSoLaterSessionsAreReached() {
        S3ChunkStore store = new S3ChunkStore(objectStorage);
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        objectStorage.upload("chunk-sessions/" + first + "/chunk-0.part", new byte[] {1}, "application/octet-stream");
        objectStorage.upload("chunk-sessions/" + second + "/chunk-0.part", new byte[] {1}, "application/octet-stream");
        java.util.Set<UUID> seen = new java.util.HashSet<>();
        // Other tests may have left active sessions' chunks; one id per call
        // must still walk past them and reach both of ours.
        for (int i = 0; i < 40 && !(seen.contains(first) && seen.contains(second)); i++) {
            seen.addAll(store.sessionsWithStorage(1));
        }
        assertTrue(seen.contains(first) && seen.contains(second),
                "a limit of one per call still reaches both sessions, saw " + seen);
        objectStorage.deleteByPrefix("chunk-sessions/" + first + "/");
        objectStorage.deleteByPrefix("chunk-sessions/" + second + "/");
    }

    private void assertNoTempFilesLeft() throws IOException {
        if (!Files.isDirectory(TEMP_ROOT)) {
            return;
        }
        try (Stream<Path> files = Files.list(TEMP_ROOT)) {
            List<Path> left = files.toList();
            assertTrue(left.isEmpty(), "temp files left behind: " + left);
        }
    }

    private static byte[] png(int width, int height) throws IOException {
        BufferedImage img = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        for (int x = 0; x < width; x++) {
            for (int y = 0; y < height; y++) {
                img.setRGB(x, y, ((x * 7) << 16) | ((y * 3) << 8) | ((x ^ y) & 0xff));
            }
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }
}
