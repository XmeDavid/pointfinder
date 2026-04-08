package com.prayer.pointfinder.websocket;

import com.prayer.pointfinder.entity.UserRole;
import com.prayer.pointfinder.service.RealtimeMetricsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import org.springframework.web.socket.messaging.SessionSubscribeEvent;

import java.util.Collections;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class StompSessionMetricsListenerTest {

    private RealtimeMetricsService metrics;
    private StompSessionMetricsListener listener;

    @BeforeEach
    void setUp() {
        metrics = mock(RealtimeMetricsService.class);
        listener = new StompSessionMetricsListener(metrics);
    }

    @Test
    void subscribeToGameTopicRecordsStompConnect() {
        UUID gameId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        String sessionId = "sess-1";

        listener.onSubscribe(buildSubscribeEvent(sessionId, "/topic/games/" + gameId, userId));

        verify(metrics).recordStompConnect(eq(gameId), eq(userId.toString()));
    }

    @Test
    void subscribeToNonGameTopicIsIgnored() {
        listener.onSubscribe(buildSubscribeEvent("sess-1", "/topic/other", UUID.randomUUID()));

        verifyNoInteractions(metrics);
    }

    @Test
    void secondSubscribeForSameSessionDoesNotDoubleCount() {
        UUID gameId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        String sessionId = "sess-1";

        listener.onSubscribe(buildSubscribeEvent(sessionId, "/topic/games/" + gameId, userId));
        listener.onSubscribe(buildSubscribeEvent(sessionId, "/topic/games/" + gameId + "/activity", userId));

        verify(metrics, times(1)).recordStompConnect(any(), any());
    }

    @Test
    void disconnectEmitsRecordStompDisconnectWithRememberedGameId() {
        UUID gameId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        String sessionId = "sess-42";

        listener.onSubscribe(buildSubscribeEvent(sessionId, "/topic/games/" + gameId, userId));
        listener.onDisconnect(buildDisconnectEvent(sessionId, CloseStatus.NORMAL));

        verify(metrics).recordStompDisconnect(eq(gameId), eq(userId.toString()),
                eq("status_" + CloseStatus.NORMAL.getCode()));
    }

    @Test
    void disconnectWithoutPriorSubscribeIsIgnored() {
        listener.onDisconnect(buildDisconnectEvent("unknown", CloseStatus.NORMAL));

        verify(metrics, never()).recordStompDisconnect(any(), any(), any());
    }

    // ───────────────────── helpers ─────────────────────

    private SessionSubscribeEvent buildSubscribeEvent(String sessionId, String destination, UUID userId) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        accessor.setSessionId(sessionId);
        accessor.setDestination(destination);
        WebSocketPrincipals.UserPrincipal principal =
                new WebSocketPrincipals.UserPrincipal(userId, UserRole.operator);
        accessor.setUser(new UsernamePasswordAuthenticationToken(principal, null, Collections.emptyList()));
        Message<byte[]> message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
        return new SessionSubscribeEvent(this, message);
    }

    private SessionDisconnectEvent buildDisconnectEvent(String sessionId, CloseStatus closeStatus) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.DISCONNECT);
        accessor.setSessionId(sessionId);
        Message<byte[]> message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
        return new SessionDisconnectEvent(this, message, sessionId, closeStatus);
    }
}
