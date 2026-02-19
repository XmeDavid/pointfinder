package com.prayer.pointfinder.websocket;

import com.prayer.pointfinder.dto.response.NotificationResponse;
import com.prayer.pointfinder.entity.Submission;
import com.prayer.pointfinder.entity.ActivityEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class GameEventBroadcaster {

    private static final int EVENT_VERSION = 1;

    private final SimpMessagingTemplate messagingTemplate;
    private final MobileRealtimeHub mobileRealtimeHub;

    public void broadcastActivityEvent(UUID gameId, ActivityEvent event) {
        Map<String, Object> data = new HashMap<>();
        data.put("id", event.getId());
        data.put("gameId", event.getGame().getId());
        data.put("type", event.getType().name());
        data.put("teamId", event.getTeam().getId());
        data.put("baseId", event.getBase() != null ? event.getBase().getId() : null);
        data.put("challengeId", event.getChallenge() != null ? event.getChallenge().getId() : null);
        data.put("message", event.getMessage());
        data.put("timestamp", event.getTimestamp().toString());
        broadcast(gameId, "activity", data);
    }

    public void broadcastNotification(UUID gameId, NotificationResponse notification) {
        broadcast(gameId, "notification", notification);
    }

    public void broadcastLeaderboardUpdate(UUID gameId, Object leaderboard) {
        broadcast(gameId, "leaderboard", leaderboard);
    }

    public void broadcastLocationUpdate(UUID gameId, Object locationData) {
        broadcast(gameId, "location", locationData);
    }

    public void broadcastGameStatus(UUID gameId, String status) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("status", status);
        broadcast(gameId, "game_status", payload);
    }

    public void broadcastSubmissionStatus(UUID gameId, Submission submission) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("id", submission.getId());
        payload.put("teamId", submission.getTeam().getId());
        payload.put("challengeId", submission.getChallenge().getId());
        payload.put("baseId", submission.getBase().getId());
        payload.put("status", submission.getStatus().name());
        payload.put("submittedAt", submission.getSubmittedAt() != null ? submission.getSubmittedAt().toString() : null);
        payload.put("reviewedBy", submission.getReviewedBy() != null ? submission.getReviewedBy().getId() : null);
        payload.put("feedback", submission.getFeedback());
        payload.put("points", submission.getPoints());
        broadcast(gameId, "submission_status", payload);
    }

    private void broadcast(UUID gameId, String type, Object data) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("version", EVENT_VERSION);
        payload.put("type", type);
        payload.put("gameId", gameId);
        payload.put("emittedAt", java.time.Instant.now().toString());
        payload.put("data", data);

        Runnable dispatch = () -> {
            String destination = "/topic/games/" + gameId;
            log.debug("Broadcasting {} event to {}", type, destination);
            messagingTemplate.convertAndSend(destination, payload);
            mobileRealtimeHub.broadcast(gameId, payload);
        };

        if (TransactionSynchronizationManager.isSynchronizationActive()
                && TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    dispatch.run();
                }
            });
        } else {
            dispatch.run();
        }
    }
}
