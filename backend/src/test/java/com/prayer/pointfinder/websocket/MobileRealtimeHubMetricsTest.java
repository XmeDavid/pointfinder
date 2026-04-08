package com.prayer.pointfinder.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.service.RealtimeMetricsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.WebSocketSession;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Verifies {@link MobileRealtimeHub} emits the expected metric events
 * through {@link RealtimeMetricsService} for every lifecycle hook.
 * Uses mocked sessions so we do not need a real WebSocket loop.
 */
class MobileRealtimeHubMetricsTest {

    private RealtimeMetricsService metrics;
    private MobileRealtimeHub hub;

    @BeforeEach
    void setUp() {
        metrics = mock(RealtimeMetricsService.class);
        hub = new MobileRealtimeHub(new ObjectMapper(), metrics);
    }

    @Test
    void registerRecordsMobileConnectWithPrincipalId() {
        UUID gameId = UUID.randomUUID();
        String principalId = "player-" + UUID.randomUUID();
        WebSocketSession session = sessionWithPrincipal(principalId);

        hub.register(gameId, session);

        verify(metrics).recordMobileConnect(eq(gameId), eq(principalId));
    }

    @Test
    void unregisterRecordsMobileDisconnectWithRememberedGameId() {
        UUID gameId = UUID.randomUUID();
        String principalId = "player-xyz";
        WebSocketSession session = sessionWithPrincipal(principalId);

        hub.register(gameId, session);
        hub.unregister(session, "client_close");

        verify(metrics).recordMobileDisconnect(eq(gameId), eq(principalId), eq("client_close"));
    }

    @Test
    void unregisterUnknownSessionIsNoOp() {
        WebSocketSession session = sessionWithPrincipal("ghost");

        hub.unregister(session, "client_close");

        verify(metrics, times(0)).recordMobileDisconnect(any(), any(), any());
    }

    @Test
    void multipleSessionsSameGameAllRecord() {
        UUID gameId = UUID.randomUUID();
        WebSocketSession a = sessionWithPrincipal("a");
        WebSocketSession b = sessionWithPrincipal("b");
        WebSocketSession c = sessionWithPrincipal("c");

        hub.register(gameId, a);
        hub.register(gameId, b);
        hub.register(gameId, c);
        hub.unregister(b, "transport_error");

        verify(metrics, times(3)).recordMobileConnect(eq(gameId), any());
        verify(metrics).recordMobileDisconnect(eq(gameId), eq("b"), eq("transport_error"));
    }

    private WebSocketSession sessionWithPrincipal(String principalId) {
        WebSocketSession session = mock(WebSocketSession.class);
        Map<String, Object> attrs = new HashMap<>();
        if (principalId != null) {
            attrs.put("principalId", principalId);
        }
        when(session.getAttributes()).thenReturn(attrs);
        return session;
    }
}
