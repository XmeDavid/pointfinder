package com.prayer.pointfinder.integration.ha;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.config.HaProperties;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.ha.InstanceIdentity;
import com.prayer.pointfinder.realtime.RealtimeDispatcher;
import com.prayer.pointfinder.realtime.RealtimeEvent;
import com.prayer.pointfinder.realtime.RealtimeOutboxConsumer;
import com.prayer.pointfinder.realtime.RealtimeOutboxRepository;
import com.prayer.pointfinder.realtime.RealtimeOutboxWriter;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.verify;

/**
 * Producer on "node-a", consumer on "node-b", one PostgreSQL. The consumer's
 * dispatcher is a mock standing in for node-b's sockets.
 */
class RealtimeOutboxIntegrationTest extends IntegrationTestBase {

    @Autowired private RealtimeOutboxRepository repository;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private HaProperties haProperties;
    @Autowired private MeterRegistry meterRegistry;
    @Autowired private GameEventBroadcaster broadcaster;

    private TransactionTemplate tx;
    private RealtimeOutboxWriter writerA;
    private RealtimeDispatcher socketsA;
    private RealtimeOutboxConsumer consumerA;
    private RealtimeDispatcher socketsB;
    private RealtimeOutboxConsumer consumerB;
    private UUID gameId;

    @BeforeEach
    void setUpNodes() {
        jdbc.update("DELETE FROM realtime_outbox");
        jdbc.update("DELETE FROM realtime_outbox_cursors");
        jdbc.update("DELETE FROM realtime_outbox_dead_letters");
        tx = new TransactionTemplate(transactionManager);
        InstanceIdentity a = new InstanceIdentity("node-a");
        InstanceIdentity b = new InstanceIdentity("node-b");
        writerA = new RealtimeOutboxWriter(repository, objectMapper, a, haProperties, new com.prayer.pointfinder.realtime.RealtimeOutboxSignal());
        socketsA = mock(RealtimeDispatcher.class);
        socketsB = mock(RealtimeDispatcher.class);
        consumerA = new RealtimeOutboxConsumer(repository, socketsA, objectMapper, a, haProperties.getOutbox(), meterRegistry);
        consumerB = new RealtimeOutboxConsumer(repository, socketsB, objectMapper, b, haProperties.getOutbox(), meterRegistry);
        consumerA.start();
        consumerB.start();
        gameId = UUID.randomUUID();
    }

    private RealtimeEvent event(String type) {
        return RealtimeEvent.all(gameId, type, Map.of("version", 1, "type", type, "gameId", gameId.toString(), "data", Map.of("k", type)));
    }

    private void commitOnA(RealtimeEvent event) {
        tx.executeWithoutResult(status -> writerA.enqueue(event));
    }

    private List<RealtimeEvent> dispatchedOn(RealtimeDispatcher sockets, int expected) {
        ArgumentCaptor<RealtimeEvent> captor = ArgumentCaptor.forClass(RealtimeEvent.class);
        verify(sockets, times(expected)).dispatch(captor.capture());
        return captor.getAllValues();
    }

    @Test
    void eventCommittedOnAIsDeliveredOnceToTheSocketsOfBothInstances() {
        commitOnA(event("activity"));
        assertEquals(1, consumerB.poll());
        RealtimeEvent delivered = dispatchedOn(socketsB, 1).get(0);
        assertEquals("activity", delivered.type());
        assertEquals(gameId, delivered.gameId());
        assertEquals("/topic/games/" + gameId, delivered.destination());
        assertEquals("activity", ((Map<?, ?>) delivered.envelope().get("data")).get("k"));
        assertEquals(1, consumerA.poll(), "the producing instance delivers through the same path");
        assertEquals("activity", dispatchedOn(socketsA, 1).get(0).type());
        assertEquals(0, consumerA.poll());
        assertEquals(0, consumerB.poll());
    }

    @Test
    void rolledBackTransactionEmitsNothing() {
        tx.executeWithoutResult(status -> {
            writerA.enqueue(event("activity"));
            status.setRollbackOnly();
        });
        assertEquals(0, repository.count());
        assertEquals(0, consumerB.poll());
        verify(socketsB, never()).dispatch(any());
    }

    /**
     * Row ids are allocated at insert time. A transaction that inserts first
     * but commits last has the lower id; a cursor keyed on the highest id seen
     * would skip it. The transaction-id window must still deliver it.
     */
    @Test
    void lowerIdRowThatCommitsLateIsStillDelivered() throws Exception {
        CountDownLatch inserted = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        Thread slow = new Thread(() -> tx.executeWithoutResult(status -> {
            writerA.enqueue(event("late"));
            inserted.countDown();
            try {
                release.await(30, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }), "slow-producer");
        slow.start();
        assertTrue(inserted.await(10, TimeUnit.SECONDS));

        commitOnA(event("fast"));
        assertEquals(1, consumerB.poll(), "only the committed row is visible");
        assertEquals("fast", dispatchedOn(socketsB, 1).get(0).type());

        release.countDown();
        slow.join(30_000);
        Long lateId = jdbc.queryForObject("SELECT id FROM realtime_outbox WHERE event_type = 'late'", Long.class);
        Long fastId = jdbc.queryForObject("SELECT id FROM realtime_outbox WHERE event_type = 'fast'", Long.class);
        assertNotNull(lateId);
        assertTrue(lateId < fastId, "the late row has the lower id (" + lateId + " < " + fastId + ")");

        assertEquals(1, consumerB.poll(), "the late lower-id row is delivered on the next poll");
        List<RealtimeEvent> all = dispatchedOn(socketsB, 2);
        assertEquals(List.of("fast", "late"), all.stream().map(RealtimeEvent::type).toList());
        assertEquals(0, consumerB.poll(), "and never again");
    }

    @Test
    void repeatedPollsDoNotRedeliver() {
        commitOnA(event("a"));
        commitOnA(event("b"));
        assertEquals(2, consumerB.poll());
        assertEquals(0, consumerB.poll());
        assertEquals(0, consumerB.poll());
        dispatchedOn(socketsB, 2);
    }

    @Test
    void restartedConsumerResumesFromItsPersistedCursorWithoutSkipping() {
        commitOnA(event("before"));
        assertEquals(1, consumerB.poll());
        reset(socketsB);
        // node-b goes down; node-a keeps committing
        commitOnA(event("while-down-1"));
        commitOnA(event("while-down-2"));
        consumerB.restart();
        int delivered = consumerB.poll();
        assertTrue(delivered >= 2, "events committed while down are replayed, got " + delivered);
        ArgumentCaptor<RealtimeEvent> captor = ArgumentCaptor.forClass(RealtimeEvent.class);
        verify(socketsB, times(delivered)).dispatch(captor.capture());
        List<String> types = captor.getAllValues().stream().map(RealtimeEvent::type).toList();
        assertEquals(1, types.stream().filter("while-down-1"::equals).count());
        assertEquals(1, types.stream().filter("while-down-2"::equals).count());
        assertTrue(types.indexOf("while-down-1") < types.indexOf("while-down-2"), "insert order preserved");
        assertEquals(0, consumerB.poll());
    }

    @Test
    void operatorAndTeamAudiencesRoundTripWithTheirDestinations() {
        UUID teamId = UUID.randomUUID();
        Map<String, Object> envelope = Map.of("version", 1, "type", "submission_status", "gameId", gameId.toString(), "data", Map.of());
        commitOnA(RealtimeEvent.operator(gameId, "submission_status", envelope));
        commitOnA(RealtimeEvent.team(gameId, teamId, "submission_status", envelope));
        assertEquals(2, consumerB.poll());
        List<RealtimeEvent> delivered = dispatchedOn(socketsB, 2);
        assertEquals(RealtimeEvent.Audience.OPERATOR, delivered.get(0).audience());
        assertEquals("/topic/games/" + gameId + "/operator/submission_status", delivered.get(0).destination());
        assertEquals(RealtimeEvent.Audience.TEAM, delivered.get(1).audience());
        assertEquals(teamId, delivered.get(1).teamId());
        assertEquals("/topic/games/" + gameId + "/team/" + teamId + "/submission_status", delivered.get(1).destination());
    }

    @Test
    void broadcasterWritesTheRowWithTheMutationAndNotOnRollback() {
        User operator = createOperator("outbox-" + UUID.randomUUID() + "@ha.test", "password123");
        Game game = createGame(operator, "Outbox", GameStatus.setup);
        UUID id = game.getId();
        long versionBefore = gameRepository.findById(id).orElseThrow().getStateVersion();

        tx.executeWithoutResult(status -> broadcaster.broadcastGameStatus(id, "live"));
        Integer rows = jdbc.queryForObject(
                "SELECT COUNT(*) FROM realtime_outbox WHERE game_id = ? AND event_type = 'game_status'", Integer.class, id);
        assertEquals(1, rows);
        String payload = jdbc.queryForObject(
                "SELECT payload::text FROM realtime_outbox WHERE game_id = ? AND event_type = 'game_status'", String.class, id);
        Map<?, ?> envelope = assertDoesNotThrow(() -> objectMapper.readValue(payload, Map.class));
        assertEquals(versionBefore + 1, ((Number) envelope.get("stateVersion")).longValue(), payload);
        assertEquals("game_status", envelope.get("type"));

        tx.executeWithoutResult(status -> {
            broadcaster.broadcastGameStatus(id, "ended");
            status.setRollbackOnly();
        });
        rows = jdbc.queryForObject(
                "SELECT COUNT(*) FROM realtime_outbox WHERE game_id = ? AND event_type = 'game_status'", Integer.class, id);
        assertEquals(1, rows, "rolled-back broadcast leaves no row");
        assertEquals(versionBefore + 1, gameRepository.findById(id).orElseThrow().getStateVersion());
    }

    @Test
    void transientDispatchFailureIsRetriedOnTheNextPollWithoutSkippingLaterRows() {
        commitOnA(event("flaky"));
        commitOnA(event("next"));
        doThrow(new IllegalStateException("socket hiccup"))
                .doNothing()
                .when(socketsB).dispatch(any());
        assertEquals(1, consumerB.poll(), "the failing row is held back, the following row is delivered");
        assertEquals(1, consumerB.pendingRetries());
        assertEquals(1, consumerB.poll(), "the held row is delivered on the retry");
        assertEquals(0, consumerB.pendingRetries());
        assertEquals(0, consumerB.poll());
        List<String> types = dispatchedOn(socketsB, 3).stream().map(RealtimeEvent::type).toList();
        assertEquals(List.of("flaky", "next", "flaky"), types, "one failed attempt, then success; nothing skipped");
    }

    @Test
    void failingRowIsRetriedOnEveryPollUntilRetentionAndNeverDroppedEarly() {
        commitOnA(event("stuck"));
        doThrow(new IllegalStateException("always")).when(socketsB).dispatch(any());
        for (int i = 0; i < 25; i++) {
            assertEquals(0, consumerB.poll());
        }
        verify(socketsB, times(25)).dispatch(any());
        assertEquals(1, consumerB.pendingRetries(), "still pending, not dropped");
        assertEquals(0, repository.countDeadLetters("node-b"));
        // The row is still delivered once the sockets recover.
        reset(socketsB);
        assertEquals(1, consumerB.poll());
        assertEquals("stuck", dispatchedOn(socketsB, 1).get(0).type());
    }

    @Test
    void rowStillFailingAtTheEndOfRetentionIsDeadLetteredDurablyAndReleasesTheStream() {
        HaProperties.Outbox shortRetention = new HaProperties.Outbox();
        shortRetention.setRetentionMinutes(0);
        RealtimeDispatcher socketsC = mock(RealtimeDispatcher.class);
        RealtimeOutboxConsumer consumerC = new RealtimeOutboxConsumer(repository, socketsC, objectMapper,
                new InstanceIdentity("node-c"), shortRetention, meterRegistry);
        consumerC.start();
        jdbc.update("DELETE FROM realtime_outbox_dead_letters WHERE instance_id = 'node-c'");
        commitOnA(event("poison"));
        doThrow(new IllegalStateException("cannot render")).when(socketsC).dispatch(any());
        assertEquals(0, consumerC.poll());
        assertEquals(1, repository.countDeadLetters("node-c"), "recorded durably, not dropped");
        Map<String, Object> dead = jdbc.queryForMap(
                "SELECT event_type, attempts, last_error FROM realtime_outbox_dead_letters WHERE instance_id = 'node-c'");
        assertEquals("poison", dead.get("event_type"));
        assertEquals(1, ((Number) dead.get("attempts")).intValue());
        assertTrue(String.valueOf(dead.get("last_error")).contains("cannot render"));
        assertEquals(0, consumerC.pendingRetries());
        reset(socketsC);
        commitOnA(event("after"));
        assertEquals(1, consumerC.poll(), "later rows flow");
        assertEquals("after", dispatchedOn(socketsC, 1).get(0).type());
    }

    @Test
    void producerCrashBetweenCommitAndDispatchLosesNothingBecauseDeliveryIsOnlyFromTheTable() {
        // node-a commits, then "crashes": its consumer restarts from the persisted cursor.
        commitOnA(event("committed-then-crashed"));
        consumerA.restart();
        assertEquals(1, consumerA.poll());
        assertEquals("committed-then-crashed", dispatchedOn(socketsA, 1).get(0).type());
        assertEquals(0, consumerA.poll());
    }

    /**
     * T1 starts first (lower transaction id) but T2 bumps the game version
     * and inserts first. Both rows are visible in one poll; delivery must
     * follow the version order (T2's row first), not the transaction-id order.
     */
    @Test
    void sameGameEventsAreDeliveredInStateVersionOrderNotTransactionIdOrder() throws Exception {
        User operator = createOperator("order-" + UUID.randomUUID() + "@ha.test", "password123");
        Game game = createGame(operator, "Order", GameStatus.live);
        UUID id = game.getId();
        CountDownLatch t1HasXid = new CountDownLatch(1);
        CountDownLatch t2Committed = new CountDownLatch(1);
        Thread t1 = new Thread(() -> tx.executeWithoutResult(status -> {
            jdbc.queryForObject("SELECT pg_current_xact_id()::text", String.class); // assign the xid now
            t1HasXid.countDown();
            try {
                assertTrue(t2Committed.await(30, TimeUnit.SECONDS));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            broadcaster.broadcastGameStatus(id, "second");
        }), "t1-early-xid-late-bump");
        t1.start();
        assertTrue(t1HasXid.await(10, TimeUnit.SECONDS));
        tx.executeWithoutResult(status -> broadcaster.broadcastGameStatus(id, "first"));
        t2Committed.countDown();
        t1.join(30_000);

        Long txFirst = jdbc.queryForObject("SELECT tx_id FROM realtime_outbox WHERE game_id = ? AND payload->'data'->>'status' = 'first'", Long.class, id);
        Long txSecond = jdbc.queryForObject("SELECT tx_id FROM realtime_outbox WHERE game_id = ? AND payload->'data'->>'status' = 'second'", Long.class, id);
        assertTrue(txSecond < txFirst, "precondition: the later bump has the lower transaction id");

        assertEquals(2, consumerB.poll());
        List<RealtimeEvent> delivered = dispatchedOn(socketsB, 2).stream()
                .filter(e -> id.equals(e.gameId())).toList();
        List<Long> versions = delivered.stream()
                .map(e -> ((Number) e.envelope().get("stateVersion")).longValue()).toList();
        assertEquals(2, versions.size());
        assertTrue(versions.get(0) < versions.get(1), "delivered in stateVersion order: " + versions);
        assertEquals("first", ((Map<?, ?>) delivered.get(0).envelope().get("data")).get("status"));
    }

    /**
     * Cleanup deletes rows only after retention plus grace, so a failing row
     * that has passed retention is dead-lettered by the consumer before the
     * table loses it.
     */
    @Test
    void cleanupNeverDeletesAFailingRowBeforeItCanBeDeadLettered() {
        HaProperties.Outbox outbox = haProperties.getOutbox();
        commitOnA(event("late-failure"));
        // Backdate the row past retention but inside the cleanup grace.
        java.sql.Timestamp pastRetention = java.sql.Timestamp.from(
                outbox.deadLetterEdge(java.time.Instant.now()).minusSeconds(30));
        jdbc.update("UPDATE realtime_outbox SET created_at = ? WHERE event_type = 'late-failure'", pastRetention);

        assertEquals(0, repository.deleteOlderThan(outbox.cleanupEdge(java.time.Instant.now()), 1000),
                "cleanup leaves the row alone inside the grace period");
        doThrow(new IllegalStateException("down")).when(socketsB).dispatch(any());
        assertEquals(0, consumerB.poll());
        assertEquals(1, repository.countDeadLetters("node-b"), "dead-lettered while the row still existed");

        // Past retention plus grace, cleanup may delete it.
        jdbc.update("UPDATE realtime_outbox SET created_at = ? WHERE event_type = 'late-failure'",
                java.sql.Timestamp.from(outbox.cleanupEdge(java.time.Instant.now()).minusSeconds(30)));
        assertEquals(1, repository.deleteOlderThan(outbox.cleanupEdge(java.time.Instant.now()), 1000));
        jdbc.update("DELETE FROM realtime_outbox_dead_letters WHERE instance_id = 'node-b'");
    }
}
