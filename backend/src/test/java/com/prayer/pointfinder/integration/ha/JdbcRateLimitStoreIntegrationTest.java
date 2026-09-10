package com.prayer.pointfinder.integration.ha;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.service.LoginAttemptService;
import com.prayer.pointfinder.service.PlayerJoinRateLimiter;
import com.prayer.pointfinder.service.ratelimit.JdbcRateLimitStore;
import com.prayer.pointfinder.service.ratelimit.RateLimitStore;
import com.prayer.pointfinder.websocket.BroadcastCodeThrottle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Two store objects ("instances") over one PostgreSQL. */
class JdbcRateLimitStoreIntegrationTest extends IntegrationTestBase {

    private static final Duration MINUTE = Duration.ofMinutes(1);

    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactionManager;

    private JdbcRateLimitStore nodeA;
    private JdbcRateLimitStore nodeB;

    @BeforeEach
    void setUpStores() {
        jdbc.update("DELETE FROM rate_limit_buckets");
        nodeA = new JdbcRateLimitStore(jdbc, transactionManager);
        nodeB = new JdbcRateLimitStore(jdbc, transactionManager);
    }

    @Test
    void alternatingHitsBetweenInstancesShareOneAllowance() {
        for (int i = 1; i <= 10; i++) {
            RateLimitStore store = i % 2 == 1 ? nodeA : nodeB;
            assertEquals(i, store.hit("t", "k", MINUTE, Instant.now()).count());
        }
    }

    @Test
    void concurrentHitsAreAllCounted() throws Exception {
        int threads = 40;
        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        List<Future<Integer>> results = new ArrayList<>();
        try {
            for (int i = 0; i < threads; i++) {
                RateLimitStore store = i % 2 == 0 ? nodeA : nodeB;
                results.add(pool.submit(() -> { go.await(); return store.hit("c", "k", MINUTE, Instant.now()).count(); }));
            }
            go.countDown();
            Set<Integer> counts = new HashSet<>();
            for (Future<Integer> f : results) counts.add(f.get(30, TimeUnit.SECONDS));
            assertEquals(threads, counts.size(), "every increment produced a distinct count");
            assertTrue(counts.contains(threads));
        } finally {
            pool.shutdownNow();
        }
        assertEquals(threads, nodeA.get("c", "k").orElseThrow().count());
    }

    @Test
    void windowExpiryOpensAFreshWindow() {
        Duration window = Duration.ofMillis(200);
        assertEquals(1, nodeA.hit("w", "k", window, Instant.now()).count());
        assertEquals(2, nodeB.hit("w", "k", window, Instant.now()).count());
        sleep(400);
        RateLimitStore.Bucket fresh = nodeA.hit("w", "k", window, Instant.now());
        assertEquals(1, fresh.count());
        assertTrue(fresh.windowStart().isAfter(Instant.now().minusMillis(300)));
    }

    @Test
    void lockoutIsSetOnTheLimitingHitAndClearsAfterItPasses() {
        Duration lockout = Duration.ofMillis(500);
        assertNull(nodeA.hit("l", "ip", MINUTE, 3, lockout, Instant.now()).lockedUntil());
        assertNull(nodeB.hit("l", "ip", MINUTE, 3, lockout, Instant.now()).lockedUntil());
        RateLimitStore.Bucket third = nodeA.hit("l", "ip", MINUTE, 3, lockout, Instant.now());
        assertNotNull(third.lockedUntil());
        assertTrue(third.locked(Instant.now()));
        // Further hits keep the original lock end
        assertEquals(third.lockedUntil(), nodeB.hit("l", "ip", MINUTE, 3, lockout, Instant.now()).lockedUntil());
        sleep(700);
        RateLimitStore.Bucket after = nodeB.hit("l", "ip", MINUTE, 3, lockout, Instant.now());
        assertEquals(1, after.count());
        assertNull(after.lockedUntil());
    }

    @Test
    void resetForgetsTheBucketForEveryInstance() {
        nodeA.hit("r", "k", MINUTE, Instant.now());
        nodeB.reset("r", "k");
        assertTrue(nodeA.get("r", "k").isEmpty());
        assertEquals(1, nodeA.hit("r", "k", MINUTE, Instant.now()).count());
    }

    @Test
    void loginFailureIsRecordedEvenWhenTheLoginTransactionRollsBack() {
        LoginAttemptService login = new LoginAttemptService(nodeA);
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        assertThrows(IllegalStateException.class, () -> tx.execute(status -> {
            login.recordFailure("Roll@Back.example");
            throw new IllegalStateException("bad credentials path rolls back");
        }));
        assertEquals(1, nodeB.get("login", "roll@back.example").orElseThrow().count(), "recorded despite the rollback");
    }

    @Test
    void loginBlockAggregatesAcrossInstancesAndSuccessResetsIt() {
        LoginAttemptService a = new LoginAttemptService(nodeA);
        LoginAttemptService b = new LoginAttemptService(nodeB);
        for (int i = 0; i < 5; i++) a.recordFailure("user@example.com");
        for (int i = 0; i < 4; i++) b.recordFailure("user@example.com");
        assertFalse(b.isBlocked("user@example.com"));
        b.recordFailure("user@example.com");
        assertTrue(a.isBlocked("user@example.com"));
        assertTrue(b.isBlocked("user@example.com"));
        a.recordSuccess("user@example.com");
        assertFalse(b.isBlocked("user@example.com"));
    }

    @Test
    void joinLimiterAlternatingBetweenInstancesDoesNotMultiplyTheAllowance() {
        PlayerJoinRateLimiter a = new PlayerJoinRateLimiter(nodeA);
        PlayerJoinRateLimiter b = new PlayerJoinRateLimiter(nodeB);
        for (int i = 1; i <= 10; i++) {
            PlayerJoinRateLimiter limiter = i % 2 == 1 ? a : b;
            assertTrue(limiter.tryAcquire("203.0.113.7", "device-" + i), "attempt " + i + " within the IP allowance");
        }
        assertFalse(a.tryAcquire("203.0.113.7", "device-11"));
        assertFalse(b.tryAcquire("203.0.113.7", "device-12"));
        // Same device on the same IP counts toward the IP bucket only once per window.
        assertTrue(b.tryAcquire("198.51.100.1", "same-device"));
        assertTrue(a.tryAcquire("198.51.100.1", "same-device"));
        assertEquals(1, nodeA.get("join_ip", "198.51.100.1").orElseThrow().count());
        assertEquals(2, nodeA.get("join_device", "same-device").orElseThrow().count());
    }

    @Test
    void broadcastThrottleLocksOutAcrossInstancesAndSuccessClears() {
        BroadcastCodeThrottle a = new BroadcastCodeThrottle(nodeA);
        BroadcastCodeThrottle b = new BroadcastCodeThrottle(nodeB);
        for (int i = 0; i < 5; i++) {
            (i % 2 == 0 ? a : b).recordFailure("192.0.2.9");
        }
        assertThrows(AccessDeniedException.class, () -> b.enforce("192.0.2.9"));
        assertThrows(AccessDeniedException.class, () -> a.enforce("192.0.2.9"));
        a.recordSuccess("192.0.2.9");
        assertDoesNotThrow(() -> b.enforce("192.0.2.9"));
    }

    @Test
    void staleBucketsAreDeletedInBoundedBatches() {
        for (int i = 0; i < 5; i++) nodeA.hit("s", "k" + i, MINUTE, Instant.now());
        jdbc.update("UPDATE rate_limit_buckets SET updated_at = now() - interval '2 days' WHERE scope = 's'");
        assertEquals(2, nodeB.deleteStale(Instant.now().minus(Duration.ofDays(1)), 2));
        assertEquals(3, nodeB.deleteStale(Instant.now().minus(Duration.ofDays(1)), 10));
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
