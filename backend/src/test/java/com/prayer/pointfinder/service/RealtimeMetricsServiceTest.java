package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.RealtimeStatsResponse;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit tests for {@link RealtimeMetricsService}. Uses a real
 * {@link SimpleMeterRegistry} so Micrometer counter/gauge semantics are
 * exercised end to end — mocking the registry would hide the reconnect
 * detection and gauge registration paths.
 */
class RealtimeMetricsServiceTest {

    private MeterRegistry meterRegistry;
    private RealtimeMetricsService metrics;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        metrics = new RealtimeMetricsService(meterRegistry);
    }

    @Test
    void stompConnectIncrementsCounterAndGauge() {
        UUID gameId = UUID.randomUUID();

        metrics.recordStompConnect(gameId, "user-1");
        metrics.recordStompConnect(gameId, "user-2");

        double connectCount = meterRegistry.counter("realtime.stomp.connect.total",
                Tags.of("gameId", gameId.toString())).count();
        assertEquals(2.0, connectCount);

        double active = meterRegistry.find("realtime.stomp.active_sessions")
                .tag("gameId", gameId.toString())
                .gauge()
                .value();
        assertEquals(2.0, active);
    }

    @Test
    void stompDisconnectDecrementsActiveGauge() {
        UUID gameId = UUID.randomUUID();

        metrics.recordStompConnect(gameId, "user-1");
        metrics.recordStompConnect(gameId, "user-2");
        metrics.recordStompDisconnect(gameId, "user-1", "client_close");

        double active = meterRegistry.find("realtime.stomp.active_sessions")
                .tag("gameId", gameId.toString())
                .gauge()
                .value();
        assertEquals(1.0, active);

        double disconnectCount = meterRegistry.counter("realtime.stomp.disconnect.total",
                Tags.of("gameId", gameId.toString(), "reason", "client_close")).count();
        assertEquals(1.0, disconnectCount);
    }

    @Test
    void activeGaugeNeverGoesBelowZero() {
        UUID gameId = UUID.randomUUID();

        metrics.recordStompDisconnect(gameId, "user-1", "ghost");
        metrics.recordStompDisconnect(gameId, "user-1", "ghost");

        double active = meterRegistry.find("realtime.stomp.active_sessions")
                .tag("gameId", gameId.toString())
                .gauge()
                .value();
        assertEquals(0.0, active);
    }

    @Test
    void stompReconnectWithinWindowIsCounted() {
        UUID gameId = UUID.randomUUID();

        metrics.recordStompConnect(gameId, "user-1");
        metrics.recordStompDisconnect(gameId, "user-1", "transport_error");
        metrics.recordStompConnect(gameId, "user-1"); // within window → reconnect

        double reconnectCount = meterRegistry.counter("realtime.stomp.reconnect.total",
                Tags.of("gameId", gameId.toString())).count();
        assertEquals(1.0, reconnectCount);

        // And the raw connect counter still reflects both connects
        double connectCount = meterRegistry.counter("realtime.stomp.connect.total",
                Tags.of("gameId", gameId.toString())).count();
        assertEquals(2.0, connectCount);
    }

    @Test
    void stompConnectWithoutPriorDisconnectIsNotReconnect() {
        UUID gameId = UUID.randomUUID();

        metrics.recordStompConnect(gameId, "user-1");
        metrics.recordStompConnect(gameId, "user-2");

        // No reconnect counter created yet → find() returns null.
        var reconnectCounter = meterRegistry.find("realtime.stomp.reconnect.total")
                .tag("gameId", gameId.toString())
                .counter();
        assertTrue(reconnectCounter == null || reconnectCounter.count() == 0.0);
    }

    @Test
    void mobileConnectIncrementsSeparateCounterFromStomp() {
        UUID gameId = UUID.randomUUID();

        metrics.recordMobileConnect(gameId, "player-1");
        metrics.recordMobileConnect(gameId, "player-2");
        metrics.recordStompConnect(gameId, "operator-1");

        assertEquals(2.0, meterRegistry.counter("realtime.mobile.connect.total",
                Tags.of("gameId", gameId.toString())).count());
        assertEquals(1.0, meterRegistry.counter("realtime.stomp.connect.total",
                Tags.of("gameId", gameId.toString())).count());
    }

    @Test
    void getStatsForGameReturnsExpectedShape() {
        UUID gameId = UUID.randomUUID();

        metrics.recordStompConnect(gameId, "op-1");
        metrics.recordStompConnect(gameId, "op-2");
        metrics.recordMobileConnect(gameId, "player-1");
        metrics.recordMobileConnect(gameId, "player-2");
        metrics.recordMobileConnect(gameId, "player-3");
        metrics.recordMobileDisconnect(gameId, "player-3", "client_close");
        metrics.recordMobileConnect(gameId, "player-3"); // reconnect

        RealtimeStatsResponse stats = metrics.getStatsForGame(gameId);

        assertNotNull(stats.getLastUpdated());
        assertEquals(2, stats.getStompActiveSessions());
        assertEquals(3, stats.getMobileActiveSessions());
        assertEquals(5, stats.getTotalActiveSessions());
        assertEquals(2L, stats.getStompConnectsLastHour());
        // 3 original + 1 reconnect = 4 connects in the window
        assertEquals(4L, stats.getMobileConnectsLastHour());
        assertEquals(1L, stats.getMobileDisconnectsLastHour());
        assertEquals(0L, stats.getStompDisconnectsLastHour());
        assertEquals(1L, stats.getEstimatedReconnectsLastHour());
    }

    @Test
    void getStatsForGameUnknownGameReturnsZeros() {
        UUID gameId = UUID.randomUUID();

        RealtimeStatsResponse stats = metrics.getStatsForGame(gameId);

        assertEquals(0, stats.getStompActiveSessions());
        assertEquals(0, stats.getMobileActiveSessions());
        assertEquals(0, stats.getTotalActiveSessions());
        assertEquals(0L, stats.getStompConnectsLastHour());
        assertEquals(0L, stats.getMobileConnectsLastHour());
        assertEquals(0L, stats.getStompDisconnectsLastHour());
        assertEquals(0L, stats.getMobileDisconnectsLastHour());
        assertEquals(0L, stats.getEstimatedReconnectsLastHour());
        assertNotNull(stats.getLastUpdated());
    }

    @Test
    void nullGameIdIsIgnored() {
        metrics.recordStompConnect(null, "user-1");
        metrics.recordMobileConnect(null, "player-1");
        // Should not throw, and no counters should exist.
        assertTrue(meterRegistry.find("realtime.stomp.connect.total").counters().isEmpty());
        assertTrue(meterRegistry.find("realtime.mobile.connect.total").counters().isEmpty());
    }

    @Test
    void nullReasonIsNormalizedToUnknown() {
        UUID gameId = UUID.randomUUID();

        metrics.recordStompConnect(gameId, "op-1");
        metrics.recordStompDisconnect(gameId, "op-1", null);

        double disconnectCount = meterRegistry.counter("realtime.stomp.disconnect.total",
                Tags.of("gameId", gameId.toString(), "reason", "unknown")).count();
        assertEquals(1.0, disconnectCount);
    }

    @Test
    void perGameCountersAreIsolated() {
        UUID gameA = UUID.randomUUID();
        UUID gameB = UUID.randomUUID();

        metrics.recordStompConnect(gameA, "op-a");
        metrics.recordStompConnect(gameB, "op-b");
        metrics.recordStompConnect(gameB, "op-b2");

        RealtimeStatsResponse statsA = metrics.getStatsForGame(gameA);
        RealtimeStatsResponse statsB = metrics.getStatsForGame(gameB);

        assertEquals(1, statsA.getStompActiveSessions());
        assertEquals(2, statsB.getStompActiveSessions());
    }
}
