package com.prayer.pointfinder.websocket;

import com.prayer.pointfinder.dto.response.NotificationResponse;
import com.prayer.pointfinder.entity.Submission;
import com.prayer.pointfinder.entity.ActivityEvent;
import com.prayer.pointfinder.repository.GameRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Fan-out for per-game realtime events. Single chokepoint for every
 * state-mutating or state-visible broadcast the backend emits.
 *
 * <p><strong>State version contract (P0 Track 2 Slice 1).</strong> Every
 * broadcast whose payload reflects a snapshot-relevant change bumps
 * {@code games.state_version} first via
 * {@link GameRepository#incrementStateVersion(UUID)} and emits the new version
 * in the envelope alongside {@code type} and {@code data}. Realtime consumers
 * (web admin, iOS, Android) store the last version they observed and, on
 * reconnect / foreground / missed event, call
 * {@code GET /api/games/{id}/snapshot} to get the canonical state — snapshot
 * is canonical, realtime is invalidation.
 *
 * <p>Bumpable events (state-mutating, snapshot-relevant):
 * <ul>
 *   <li>{@code activity} — check-ins, submissions</li>
 *   <li>{@code submission_status} — review decisions</li>
 *   <li>{@code leaderboard} — score changes</li>
 *   <li>{@code game_status} — setup/live/ended transitions (the "game is not
 *       active" recovery case)</li>
 *   <li>{@code game_config} — game/team/base/challenge edits</li>
 *   <li>{@code notification} — operator messages</li>
 * </ul>
 *
 * <p>Transient events that intentionally do NOT bump:
 * <ul>
 *   <li>{@code location} — very high frequency, would thrash the counter</li>
 *   <li>{@code presence} — operator availability, not state a snapshot would
 *       restore</li>
 * </ul>
 *
 * <p>The bump is a durable DB write. When the caller is inside a transaction
 * (the common case for business mutations) it joins that transaction and
 * commits with the mutation; when the caller is outside a transaction (for
 * example a read-only triggered event) it is an auto-committed statement. The
 * WebSocket dispatch still happens in {@code afterCommit()} so mobile and web
 * consumers never see a version that will be rolled back.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class GameEventBroadcaster {

    private static final int EVENT_VERSION = 1;

    private final SimpMessagingTemplate messagingTemplate;
    private final MobileRealtimeHub mobileRealtimeHub;
    private final GameRepository gameRepository;

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
        broadcast(gameId, "activity", data, true);
    }

    public void broadcastNotification(UUID gameId, NotificationResponse notification) {
        broadcast(gameId, "notification", notification, true);
    }

    public void broadcastLeaderboardUpdate(UUID gameId, Object leaderboard) {
        broadcast(gameId, "leaderboard", leaderboard, true);
    }

    public void broadcastLocationUpdate(UUID gameId, Object locationData) {
        // location is transient — high-frequency team movement. Do not bump
        // stateVersion; it would thrash the counter and force snapshot fetches
        // that carry no leaderboard/progress change.
        broadcast(gameId, "location", locationData, false);
    }

    public void broadcastGameStatus(UUID gameId, String status) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("status", status);
        broadcast(gameId, "game_status", payload, true);
    }

    public void broadcastGameConfig(UUID gameId, String entity, String action) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("entity", entity);
        payload.put("action", action);
        broadcast(gameId, "game_config", payload, true);
    }

    public void broadcastStageUnlock(UUID gameId, UUID stageId) {
        Map<String, Object> data = new HashMap<>();
        data.put("stageId", stageId.toString());
        broadcast(gameId, "stage_unlock", data, true);
    }

    public void broadcastPresence(UUID gameId, Object presenceData) {
        // presence is transient — operator online/offline tracking. Do not
        // bump stateVersion; a client reconnecting via snapshot does not need
        // to see whose browser tab is currently open.
        broadcast(gameId, "presence", presenceData, false);
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
        broadcast(gameId, "submission_status", payload, true);
    }

    private void broadcast(UUID gameId, String type, Object data, boolean bumpStateVersion) {
        Long stateVersion = null;
        if (bumpStateVersion) {
            try {
                stateVersion = gameRepository.incrementStateVersion(gameId);
            } catch (Exception ex) {
                // A failed bump must never prevent a broadcast from landing.
                // A dropped bump degrades the snapshot freshness contract
                // (clients might miss a state change) but a dropped broadcast
                // would corrupt live UX. Prefer honest realtime over a
                // version-correct silence.
                log.warn("Failed to bump state_version for game {} on {} event: {}",
                        gameId, type, ex.getMessage());
            }
        }

        Map<String, Object> payload = new HashMap<>();
        payload.put("version", EVENT_VERSION);
        payload.put("type", type);
        payload.put("gameId", gameId);
        payload.put("emittedAt", java.time.Instant.now().toString());
        if (stateVersion != null) {
            payload.put("stateVersion", stateVersion);
        }
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
