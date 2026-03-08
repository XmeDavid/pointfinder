package com.prayer.pointfinder.websocket;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.util.Set;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class OperatorPresenceTrackerTest {

    private OperatorPresenceTracker tracker;

    @BeforeEach
    void setUp() {
        tracker = new OperatorPresenceTracker();
    }

    @Test
    void registerAddsOperatorToGame() {
        UUID gameId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        tracker.register("session-1", gameId, userId, "David");
        Set<OperatorPresenceTracker.OperatorInfo> operators = tracker.getOperators(gameId);
        assertEquals(1, operators.size());
        var op = operators.iterator().next();
        assertEquals(userId, op.userId());
        assertEquals("David", op.name());
        assertEquals("D", op.initials());
    }

    @Test
    void unregisterRemovesOperator() {
        UUID gameId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        tracker.register("session-1", gameId, userId, "David");
        tracker.unregister("session-1");
        assertTrue(tracker.getOperators(gameId).isEmpty());
    }

    @Test
    void multipleTabsDeduplicatedByUserId() {
        UUID gameId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        tracker.register("session-1", gameId, userId, "David");
        tracker.register("session-2", gameId, userId, "David");
        assertEquals(1, tracker.getOperators(gameId).size());
    }

    @Test
    void multipleTabsRequireAllDisconnectsToRemove() {
        UUID gameId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        tracker.register("session-1", gameId, userId, "David");
        tracker.register("session-2", gameId, userId, "David");
        tracker.unregister("session-1");
        assertEquals(1, tracker.getOperators(gameId).size());
        tracker.unregister("session-2");
        assertTrue(tracker.getOperators(gameId).isEmpty());
    }

    @Test
    void multipleOperatorsTrackedSeparately() {
        UUID gameId = UUID.randomUUID();
        UUID user1 = UUID.randomUUID();
        UUID user2 = UUID.randomUUID();
        tracker.register("session-1", gameId, user1, "David");
        tracker.register("session-2", gameId, user2, "Maria");
        assertEquals(2, tracker.getOperators(gameId).size());
    }

    @Test
    void emptyGameReturnsEmptySet() {
        assertTrue(tracker.getOperators(UUID.randomUUID()).isEmpty());
    }

    @Test
    void initialsFromTwoWordName() {
        UUID gameId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        tracker.register("session-1", gameId, userId, "David Marques");
        var op = tracker.getOperators(gameId).iterator().next();
        assertEquals("DM", op.initials());
    }

    @Test
    void unregisterReturnsPreviousGameId() {
        UUID gameId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        tracker.register("session-1", gameId, userId, "David");
        assertEquals(gameId, tracker.unregister("session-1"));
    }

    @Test
    void unregisterUnknownSessionReturnsNull() {
        assertNull(tracker.unregister("unknown-session"));
    }
}
