package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.response.RealtimeStatsResponse;
import com.prayer.pointfinder.ha.InstanceIdentity;
import com.prayer.pointfinder.service.GameAccessService;
import com.prayer.pointfinder.service.RealtimeMetricsService;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/**
 * OW-24: realtime health figures come from the process that answered, not
 * the fleet. The response says so and names that server, so two replicas
 * cannot be mistaken for one total.
 */
class RealtimeStatsScopeTest {

    @Test
    void statsNameTheServerTheyCameFrom() {
        UUID gameId = UUID.randomUUID();
        RealtimeMetricsService metrics = new RealtimeMetricsService(new SimpleMeterRegistry());
        metrics.recordStompConnect(gameId, "user-1");
        GameAccessService access = mock(GameAccessService.class);
        RealtimeStatsController controller = new RealtimeStatsController(metrics, access, new InstanceIdentity("api-1"));

        RealtimeStatsResponse stats = controller.getRealtimeStats(gameId).getBody();

        verify(access).ensureCurrentUserCanAccessGame(gameId);
        assertEquals(1, stats.stompActiveSessions());
        assertEquals("instance", stats.scope());
        assertEquals("api-1", stats.instanceId());
    }
}
