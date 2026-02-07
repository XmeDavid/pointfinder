package com.dbv.scoutmission.websocket;

import com.dbv.scoutmission.dto.response.NotificationResponse;
import com.dbv.scoutmission.entity.ActivityEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class GameEventBroadcaster {

    private final SimpMessagingTemplate messagingTemplate;

    public void broadcastActivityEvent(UUID gameId, ActivityEvent event) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("type", "activity");
        payload.put("data", Map.of(
            "id", event.getId(),
            "gameId", event.getGame().getId(),
            "type", event.getType().name(),
            "teamId", event.getTeam().getId(),
            "baseId", event.getBase() != null ? event.getBase().getId() : null,
            "challengeId", event.getChallenge() != null ? event.getChallenge().getId() : null,
            "message", event.getMessage(),
            "timestamp", event.getTimestamp().toString()
        ));

        String destination = "/topic/games/" + gameId;
        log.debug("Broadcasting activity event to {}", destination);
        messagingTemplate.convertAndSend(destination, payload);
    }

    public void broadcastNotification(UUID gameId, NotificationResponse notification) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("type", "notification");
        payload.put("data", notification);

        String destination = "/topic/games/" + gameId;
        log.debug("Broadcasting notification to {}", destination);
        messagingTemplate.convertAndSend(destination, payload);
    }

    public void broadcastLeaderboardUpdate(UUID gameId, Object leaderboard) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("type", "leaderboard");
        payload.put("data", leaderboard);

        String destination = "/topic/games/" + gameId;
        messagingTemplate.convertAndSend(destination, payload);
    }

    public void broadcastLocationUpdate(UUID gameId, Object locationData) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("type", "location");
        payload.put("data", locationData);

        String destination = "/topic/games/" + gameId;
        messagingTemplate.convertAndSend(destination, payload);
    }
}
