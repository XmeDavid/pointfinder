package com.prayer.pointfinder.realtime;

import com.prayer.pointfinder.websocket.MobileRealtimeHub;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

/**
 * Delivers one {@link RealtimeEvent} to the sockets attached to <em>this</em>
 * process: the STOMP simple broker (web, native STOMP) and the plain mobile
 * websocket hub. Used by {@code GameEventBroadcaster} for the instance that
 * produced the event and by {@link RealtimeOutboxConsumer} for every other
 * instance.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RealtimeDispatcher {

    private final SimpMessagingTemplate messagingTemplate;
    private final MobileRealtimeHub mobileRealtimeHub;

    public void dispatch(RealtimeEvent event) {
        String destination = event.destination();
        log.debug("Dispatching {} ({}) to {}", event.type(), event.audience(), destination);
        messagingTemplate.convertAndSend(destination, event.envelope());
        switch (event.audience()) {
            case ALL -> mobileRealtimeHub.broadcast(event.gameId(), event.envelope());
            case OPERATOR -> mobileRealtimeHub.broadcastToOperators(event.gameId(), event.envelope());
            case TEAM -> mobileRealtimeHub.broadcastToTeam(event.gameId(), event.teamId(), event.envelope());
        }
    }
}
