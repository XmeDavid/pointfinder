package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.repository.GameRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Verifies that {@code GameRepository.incrementStateVersion} is atomic at the
 * database level. Concurrent bumps must every see a strictly different value,
 * the final stored value must equal the number of bumps, and the returned
 * values must be exactly {@code {1, 2, ..., N}}.
 *
 * <p>This test runs against the Testcontainers PostgreSQL fixture because the
 * atomicity guarantee comes from PostgreSQL's row-level locking during the
 * single {@code UPDATE ... RETURNING} statement. An in-memory H2 run could
 * pass even if the production query were broken.
 *
 * <p>Source spec: docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md
 * (P0 Track 2 Slice 1).
 */
class GameStateVersionConcurrencyTest extends IntegrationTestBase {

    @Autowired
    private GameRepository gameRepositoryUnderTest;

    @Test
    void concurrentIncrementsProduceUniqueMonotonicValues() throws Exception {
        User operator = createOperator("op-concurrency@snap.test", "password123");
        Game game = createGame(operator, "Concurrency Game", GameStatus.setup);
        UUID gameId = game.getId();

        // Baseline sanity: a freshly-created game starts at 0.
        Long baseline = gameRepositoryUnderTest.findStateVersionById(gameId);
        assertEquals(0L, baseline, "fresh games start at state_version = 0");

        final int workers = 16;
        final int bumpsPerWorker = 25;
        final int expectedTotal = workers * bumpsPerWorker;

        ExecutorService pool = Executors.newFixedThreadPool(workers);
        try {
            List<Callable<List<Long>>> tasks = new ArrayList<>();
            for (int i = 0; i < workers; i++) {
                tasks.add(() -> {
                    List<Long> seen = new ArrayList<>(bumpsPerWorker);
                    for (int j = 0; j < bumpsPerWorker; j++) {
                        Long next = gameRepositoryUnderTest.incrementStateVersion(gameId);
                        seen.add(next);
                    }
                    return seen;
                });
            }

            List<Future<List<Long>>> results = pool.invokeAll(tasks);
            Set<Long> all = new HashSet<>();
            List<Long> flatMerged = new ArrayList<>(expectedTotal);
            for (Future<List<Long>> f : results) {
                List<Long> seen = f.get();
                for (Long v : seen) {
                    assertNotNull(v, "incrementStateVersion must never return null for an existing game");
                    assertTrue(v > 0, "state version must be strictly positive after a bump");
                    flatMerged.add(v);
                }
                all.addAll(seen);
            }

            // Uniqueness: no value was returned twice — that is the
            // "no lost increments" guarantee.
            assertEquals(expectedTotal, all.size(),
                    "all " + expectedTotal + " bumps must return distinct values");

            // Exactness: the set of returned values is exactly {1..N}.
            Set<Long> expected = new HashSet<>();
            for (long v = 1; v <= expectedTotal; v++) expected.add(v);
            assertEquals(expected, all,
                    "concurrent bumps must cover exactly 1..N with no gaps");

            // Each worker individually saw strictly-monotonic values within
            // its own sequence (not globally monotonic, since workers interleave,
            // but per-worker monotonicity is a weaker sanity check).
            for (Future<List<Long>> f : results) {
                List<Long> seen = f.get();
                List<Long> sorted = new ArrayList<>(seen);
                Collections.sort(sorted);
                assertEquals(sorted, seen,
                        "values returned to a single worker should be monotonically non-decreasing");
            }
            // Sanity: every value we flat-merged is accounted for in the set.
            assertEquals(expectedTotal, flatMerged.size());

            // Final stored value equals the total bump count.
            Long finalVersion = gameRepositoryUnderTest.findStateVersionById(gameId);
            assertEquals((long) expectedTotal, finalVersion,
                    "final state_version must equal the total number of bumps");
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void incrementOnNonExistentGameIsSafe() {
        UUID ghost = UUID.randomUUID();
        // The UPDATE matches zero rows, so the RETURNING clause yields no
        // row, and Spring Data returns null. The critical property is that
        // it does NOT throw — a ghost game id must not crash a broadcaster.
        Long result = gameRepositoryUnderTest.incrementStateVersion(ghost);
        assertNull(result, "nonexistent game should yield null, not an exception");
    }
}
