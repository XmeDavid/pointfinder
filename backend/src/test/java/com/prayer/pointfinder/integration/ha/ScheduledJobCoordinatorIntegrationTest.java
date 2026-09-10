package com.prayer.pointfinder.integration.ha;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.config.HaProperties;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.ha.InstanceIdentity;
import com.prayer.pointfinder.service.GameSchedulerService;
import com.prayer.pointfinder.service.jobs.ScheduledJobCoordinator;
import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Two coordinators ("node-a", "node-b") sharing one PostgreSQL. Real leases,
 * real row locks, real clock.
 */
class ScheduledJobCoordinatorIntegrationTest extends IntegrationTestBase {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private HaProperties haProperties;
    @Autowired private MeterRegistry meterRegistry;
    @Autowired private GameSchedulerService gameSchedulerService;
    @Autowired private com.prayer.pointfinder.repository.StageRepository stageRepository;
    @Autowired private com.prayer.pointfinder.repository.UploadSessionRepository uploadSessionRepository;

    private ScheduledJobCoordinator nodeA;
    private ScheduledJobCoordinator nodeB;

    @BeforeEach
    void setUpCoordinators() {
        jdbc.update("DELETE FROM scheduled_job_leases");
        nodeA = new ScheduledJobCoordinator(jdbc, transactionManager, new InstanceIdentity("node-a"), haProperties, meterRegistry);
        nodeB = new ScheduledJobCoordinator(jdbc, transactionManager, new InstanceIdentity("node-b"), haProperties, meterRegistry);
    }

    @Test
    void concurrentTicksOnBothInstancesRunTheJobOnce() throws Exception {
        String job = "test.concurrent";
        AtomicInteger runs = new AtomicInteger();
        CountDownLatch go = new CountDownLatch(1);
        Runnable body = () -> {
            runs.incrementAndGet();
            sleep(300);
        };
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<ScheduledJobCoordinator.Outcome> a = pool.submit(() -> { go.await(); return nodeA.run(job, Duration.ofSeconds(30), body); });
            Future<ScheduledJobCoordinator.Outcome> b = pool.submit(() -> { go.await(); return nodeB.run(job, Duration.ofSeconds(30), body); });
            go.countDown();
            List<ScheduledJobCoordinator.Outcome> outcomes = List.of(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS));
            assertEquals(1, runs.get(), "job body must run exactly once");
            assertTrue(outcomes.contains(ScheduledJobCoordinator.Outcome.RAN));
            assertTrue(outcomes.contains(ScheduledJobCoordinator.Outcome.SKIPPED));
        } finally {
            pool.shutdownNow();
        }
        ScheduledJobCoordinator.LeaseState state = nodeA.state(job).orElseThrow();
        assertEquals("ok", state.lastOutcome());
        assertNull(state.leasedUntil(), "lease released after completion");
    }

    @Test
    void sequentialTicksOnDifferentInstancesBothRun() {
        String job = "test.sequential";
        AtomicInteger runs = new AtomicInteger();
        assertEquals(ScheduledJobCoordinator.Outcome.RAN, nodeA.run(job, Duration.ofSeconds(30), runs::incrementAndGet));
        assertEquals(ScheduledJobCoordinator.Outcome.RAN, nodeB.run(job, Duration.ofSeconds(30), runs::incrementAndGet));
        assertEquals(2, runs.get());
        assertEquals(2, nodeA.state(job).orElseThrow().runCount());
        assertEquals("node-b", nodeA.state(job).orElseThrow().owner());
    }

    @Test
    void crashedHolderKeepsLeaseUntilExpiryThenOtherInstanceClaims() {
        String job = "test.crash";
        // Claim without ever releasing: the process died mid-job.
        assertTrue(nodeA.tryClaim(job, Instant.now(), Duration.ofMillis(600)));
        AtomicInteger runs = new AtomicInteger();
        assertEquals(ScheduledJobCoordinator.Outcome.SKIPPED, nodeB.run(job, Duration.ofSeconds(30), runs::incrementAndGet));
        assertEquals(0, runs.get());
        sleep(800);
        assertEquals(ScheduledJobCoordinator.Outcome.RAN, nodeB.run(job, Duration.ofSeconds(30), runs::incrementAndGet));
        assertEquals(1, runs.get(), "work is not lost: it runs once the crashed lease expires");
    }

    @Test
    void failureReleasesTheLeaseAndRecordsTheErrorSoTheNextTickRetries() {
        String job = "test.failure";
        assertEquals(ScheduledJobCoordinator.Outcome.FAILED,
                nodeA.run(job, Duration.ofSeconds(30), () -> { throw new IllegalStateException("boom"); }));
        ScheduledJobCoordinator.LeaseState state = nodeA.state(job).orElseThrow();
        assertEquals("error", state.lastOutcome());
        assertTrue(state.lastError().contains("boom"));
        assertNull(state.leasedUntil());
        AtomicInteger runs = new AtomicInteger();
        assertEquals(ScheduledJobCoordinator.Outcome.RAN, nodeB.run(job, Duration.ofSeconds(30), runs::incrementAndGet));
        assertEquals(1, runs.get());
    }

    @Test
    void uncoordinatedModeRunsOnEveryInstance() {
        HaProperties local = new HaProperties();
        local.getJobs().setCoordinated(false);
        ScheduledJobCoordinator a = new ScheduledJobCoordinator(jdbc, transactionManager, new InstanceIdentity("a"), local, meterRegistry);
        ScheduledJobCoordinator b = new ScheduledJobCoordinator(jdbc, transactionManager, new InstanceIdentity("b"), local, meterRegistry);
        AtomicInteger runs = new AtomicInteger();
        assertEquals(ScheduledJobCoordinator.Outcome.RAN, a.run("test.uncoordinated", runs::incrementAndGet));
        assertEquals(ScheduledJobCoordinator.Outcome.RAN, b.run("test.uncoordinated", runs::incrementAndGet));
        assertEquals(2, runs.get());
        assertFalse(a.state("test.uncoordinated").isPresent(), "no lease rows are written in uncoordinated mode");
    }

    /**
     * Even without the lease (a stalled run whose lease expired), the job body
     * itself must not duplicate a logical transition: the conditional update
     * lets only one of two overlapping runs broadcast game_status.
     */
    @Test
    void overlappingAutoEndRunsProduceOneTransitionAndOneEvent() throws Exception {
        User operator = createOperator("sched-" + UUID.randomUUID() + "@ha.test", "password123");
        Game game = createGame(operator, "Ends now", GameStatus.live);
        game.setEndDate(Instant.now().minusSeconds(30));
        gameRepository.save(game);
        UUID gameId = game.getId();
        jdbc.update("DELETE FROM realtime_outbox WHERE game_id = ?", gameId);

        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<?> a = pool.submit(() -> { go.await(); gameSchedulerService.autoEndGames(); return null; });
            Future<?> b = pool.submit(() -> { go.await(); gameSchedulerService.autoEndGames(); return null; });
            go.countDown();
            a.get(20, TimeUnit.SECONDS);
            b.get(20, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }
        // and once more, sequentially
        gameSchedulerService.autoEndGames();

        assertEquals(GameStatus.ended, gameRepository.findById(gameId).orElseThrow().getStatus());
        Integer events = jdbc.queryForObject(
                "SELECT COUNT(*) FROM realtime_outbox WHERE game_id = ? AND event_type = 'game_status'",
                Integer.class, gameId);
        assertEquals(1, events, "exactly one game_status event for the transition");
    }

    @Test
    void leaseOverrunIsDetectedAndReported() {
        String job = "test.overrun";
        double before = meterRegistry.counter("jobs.lease_overrun", "job", job).count();
        assertEquals(ScheduledJobCoordinator.Outcome.RAN,
                nodeA.run(job, Duration.ofMillis(200), () -> sleep(600)));
        assertEquals(before + 1, meterRegistry.counter("jobs.lease_overrun", "job", job).count(),
                "a job that outlives its lease is reported");
        assertEquals("ok", nodeA.state(job).orElseThrow().lastOutcome());
    }

    /**
     * The lease expires under a slow run. The other instance claims the lease
     * but must not execute: the advisory lock held by the running job stops
     * it, so the body runs once, and again only after the first run ended.
     */
    @Test
    void expiredLeaseUnderASlowRunDoesNotAllowASecondActiveRun() throws Exception {
        String job = "test.slow-overrun";
        AtomicInteger runs = new AtomicInteger();
        AtomicInteger concurrent = new AtomicInteger();
        AtomicInteger maxConcurrent = new AtomicInteger();
        CountDownLatch aStarted = new CountDownLatch(1);
        Runnable body = () -> {
            int c = concurrent.incrementAndGet();
            maxConcurrent.accumulateAndGet(c, Math::max);
            runs.incrementAndGet();
            aStarted.countDown();
            sleep(900);
            concurrent.decrementAndGet();
        };
        ExecutorService pool = Executors.newFixedThreadPool(1);
        try {
            Future<ScheduledJobCoordinator.Outcome> a = pool.submit(() -> nodeA.run(job, Duration.ofMillis(200), body));
            assertTrue(aStarted.await(10, TimeUnit.SECONDS));
            sleep(400); // node-a's lease has expired; node-a is still running
            assertEquals(ScheduledJobCoordinator.Outcome.SKIPPED, nodeB.run(job, Duration.ofSeconds(30), body),
                    "lease claimable, but the running job holds the advisory lock");
            assertEquals(ScheduledJobCoordinator.Outcome.RAN, a.get(10, TimeUnit.SECONDS));
        } finally {
            pool.shutdownNow();
        }
        assertEquals(1, runs.get(), "no second run while the first executes");
        assertEquals(1, maxConcurrent.get());
        assertEquals(ScheduledJobCoordinator.Outcome.RAN, nodeB.run(job, Duration.ofSeconds(30), body));
        assertEquals(2, runs.get());
    }

    @Test
    void jobBodyRunsInsideTheCoordinatorTransactionThatHoldsTheAdvisoryLock() {
        String job = "test.joins-tx";
        nodeA.run(job, Duration.ofSeconds(30), () -> {
            assertTrue(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive());
            Boolean held = jdbc.queryForObject(
                    "SELECT pg_try_advisory_xact_lock(?, hashtext(?))", Boolean.class,
                    ScheduledJobCoordinator.ADVISORY_NAMESPACE, job);
            assertTrue(held, "same transaction re-acquires its own advisory lock");
        });
        assertEquals("ok", nodeA.state(job).orElseThrow().lastOutcome());
    }

    /**
     * Same overlap for stage activation: one activation, one stage_unlock
     * event, and an operator who rescheduled in between wins.
     */
    @Test
    void overlappingStageActivationRunsProduceOneActivationAndRespectReschedules() throws Exception {
        User operator = createOperator("stages-" + UUID.randomUUID() + "@ha.test", "password123");
        Game game = createGame(operator, "Stages", GameStatus.live);
        UUID gameId = game.getId();
        com.prayer.pointfinder.entity.Stage due = stageRepository.save(com.prayer.pointfinder.entity.Stage.builder()
                .game(game).name("Due").orderIndex(0)
                .transitionType(com.prayer.pointfinder.entity.TransitionType.scheduled)
                .scheduledAt(java.time.OffsetDateTime.now().minusMinutes(1)).isActive(false).build());
        com.prayer.pointfinder.entity.Stage rescheduled = stageRepository.save(com.prayer.pointfinder.entity.Stage.builder()
                .game(game).name("Rescheduled").orderIndex(1)
                .transitionType(com.prayer.pointfinder.entity.TransitionType.scheduled)
                .scheduledAt(java.time.OffsetDateTime.now().minusMinutes(1)).isActive(false).build());
        jdbc.update("DELETE FROM realtime_outbox WHERE game_id = ?", gameId);
        // An operator moves the second stage into the future after the job's
        // query would have selected it; simulate by updating it right before
        // the runs start (the conditional update must re-check the time).
        jdbc.update("UPDATE stages SET scheduled_at = now() + interval '1 hour' WHERE id = ?", rescheduled.getId());

        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<?> a = pool.submit(() -> { go.await(); gameSchedulerService.activateScheduledStages(); return null; });
            Future<?> b = pool.submit(() -> { go.await(); gameSchedulerService.activateScheduledStages(); return null; });
            go.countDown();
            a.get(20, TimeUnit.SECONDS);
            b.get(20, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }
        gameSchedulerService.activateScheduledStages();

        assertTrue(stageRepository.findById(due.getId()).orElseThrow().getIsActive());
        assertFalse(stageRepository.findById(rescheduled.getId()).orElseThrow().getIsActive(), "rescheduled stage untouched");
        Integer unlocks = jdbc.queryForObject(
                "SELECT COUNT(*) FROM realtime_outbox WHERE game_id = ? AND event_type = 'stage_unlock'", Integer.class, gameId);
        assertEquals(1, unlocks, "exactly one stage_unlock event");
    }

    @Test
    void overlappingUploadExpiryRunsExpireEachSessionOnce() throws Exception {
        User operator = createOperator("expiry-" + UUID.randomUUID() + "@ha.test", "password123");
        Game game = createGame(operator, "Expiry", GameStatus.live);
        com.prayer.pointfinder.entity.Team team = createTeam(game, "T", "EXP001");
        com.prayer.pointfinder.entity.Player player = createPlayer(team, "P", "dev-exp");
        int sessions = 6;
        for (int i = 0; i < sessions; i++) {
            uploadSessionRepository.save(com.prayer.pointfinder.entity.UploadSession.builder()
                    .game(game).player(player).contentType("image/png").totalSizeBytes(10)
                    .chunkSizeBytes(10).totalChunks(1)
                    .status(com.prayer.pointfinder.entity.UploadSessionStatus.active)
                    .expiresAt(Instant.now().minusSeconds(60)).build());
        }
        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        int total;
        try {
            Future<Integer> a = pool.submit(() -> { go.await(); return gameSchedulerService.expireStaleChunkUploadSessionsAndCount(); });
            Future<Integer> b = pool.submit(() -> { go.await(); return gameSchedulerService.expireStaleChunkUploadSessionsAndCount(); });
            go.countDown();
            total = a.get(20, TimeUnit.SECONDS) + b.get(20, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }
        assertEquals(sessions, total, "each session expired by exactly one run");
        assertEquals(0, gameSchedulerService.expireStaleChunkUploadSessionsAndCount());
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
