package com.prayer.pointfinder.integration.ha;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.config.HaProperties;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.ha.InstanceIdentity;
import com.prayer.pointfinder.websocket.OperatorPresenceTracker;
import com.prayer.pointfinder.websocket.presence.JdbcOperatorPresenceStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Two trackers ("node-a", "node-b") over one shared presence table. */
class OperatorPresenceIntegrationTest extends IntegrationTestBase {

    private static final long TTL_SECONDS = 2;

    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactionManager;

    private JdbcOperatorPresenceStore store;
    private OperatorPresenceTracker nodeA;
    private OperatorPresenceTracker nodeB;
    private Game game;
    private User alice;
    private User bob;

    @BeforeEach
    void setUpPresence() {
        jdbc.update("DELETE FROM operator_presence");
        HaProperties props = new HaProperties();
        props.getPresence().setTtlSeconds(TTL_SECONDS);
        store = new JdbcOperatorPresenceStore(jdbc, transactionManager);
        nodeA = new OperatorPresenceTracker(store, new InstanceIdentity("node-a"), props);
        nodeB = new OperatorPresenceTracker(store, new InstanceIdentity("node-b"), props);
        alice = createOperator("alice-" + UUID.randomUUID() + "@ha.test", "password123");
        bob = createOperator("bob-" + UUID.randomUUID() + "@ha.test", "password123");
        game = createGame(alice, "Presence", GameStatus.live);
    }

    @Test
    void presenceAggregatesSessionsFromBothInstances() {
        nodeA.register("sess-a1", game.getId(), alice.getId(), "Alice A");
        nodeB.register("sess-b1", game.getId(), bob.getId(), "Bob B");
        assertEquals(2, nodeA.getOperators(game.getId()).size());
        assertEquals(2, nodeB.getOperators(game.getId()).size());
        assertEquals(Set.of("AA", "BB"), nodeB.getOperators(game.getId()).stream()
                .map(OperatorPresenceTracker.OperatorInfo::initials).collect(java.util.stream.Collectors.toSet()));
    }

    @Test
    void disconnectingOneSessionKeepsTheSameUsersOtherSessionOnTheOtherNode() {
        nodeA.register("sess-a1", game.getId(), alice.getId(), "Alice");
        nodeB.register("sess-b1", game.getId(), alice.getId(), "Alice");
        assertEquals(1, nodeA.getOperators(game.getId()).size(), "same user once");
        assertEquals(game.getId(), nodeA.unregister("sess-a1"));
        assertEquals(1, nodeB.getOperators(game.getId()).size(), "session on B still counts");
        assertEquals(game.getId(), nodeB.unregister("sess-b1"));
        assertTrue(nodeA.getOperators(game.getId()).isEmpty());
    }

    @Test
    void crashedInstanceSessionsExpireAndReconnectRestoresThem() {
        nodeA.register("sess-a1", game.getId(), alice.getId(), "Alice");
        nodeB.register("sess-b1", game.getId(), bob.getId(), "Bob");
        // Only node-a keeps heart-beating; node-b "crashed".
        Instant until = Instant.now().plusSeconds(TTL_SECONDS + 1);
        while (Instant.now().isBefore(until)) {
            assertEquals(1, nodeA.heartbeat());
            sleep(250);
        }
        Set<OperatorPresenceTracker.OperatorInfo> visible = nodeA.getOperators(game.getId());
        assertEquals(1, visible.size());
        assertEquals(alice.getId(), visible.iterator().next().userId());

        List<UUID> affected = store.expire(Instant.now().minus(Duration.ofSeconds(TTL_SECONDS)), 100);
        assertEquals(List.of(game.getId()), affected, "cleanup reports the game whose presence changed");
        assertEquals(0, store.present(game.getId(), Instant.EPOCH).stream()
                .filter(op -> op.userId().equals(bob.getId())).count(), "expired row is gone");

        nodeB.register("sess-b2", game.getId(), bob.getId(), "Bob");
        assertEquals(2, nodeA.getOperators(game.getId()).size());
    }

    @Test
    void heartbeatReinsertsSessionsWhoseRowsWereLostWhileTheSocketStayedOpen() {
        nodeA.register("sess-a1", game.getId(), alice.getId(), "Alice");
        // Rows vanish (expired during a pause, or a database outage) while the socket is still open.
        jdbc.update("DELETE FROM operator_presence WHERE session_id = ?", "sess-a1");
        assertTrue(nodeA.getOperators(game.getId()).isEmpty());
        assertEquals(1, nodeA.heartbeat(), "heartbeat re-asserts the owned session");
        assertEquals(1, nodeA.getOperators(game.getId()).size());
        // An unregistered session is never resurrected by a later heartbeat.
        nodeA.unregister("sess-a1");
        assertEquals(0, nodeA.heartbeat());
        assertTrue(nodeA.getOperators(game.getId()).isEmpty());
        assertEquals(0, nodeA.ownedSessionCount());
    }

    @Test
    void gracefulShutdownRemovesOnlyThatInstancesSessions() {
        nodeA.register("sess-a1", game.getId(), alice.getId(), "Alice");
        nodeB.register("sess-b1", game.getId(), bob.getId(), "Bob");
        assertEquals(List.of(game.getId()), store.removeInstance("node-b"));
        assertEquals(1, nodeA.getOperators(game.getId()).size());
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
