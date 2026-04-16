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

    /**
     * Leaderboard updates are OPERATOR-ONLY. Players do not see scores or
     * leaderboards anywhere in the product (per CLAUDE.md "Players don't see
     * scores or leaderboards"), so the broadcast lands on the operator
     * sub-topic and on the mobile hub filtered to operator principals. The
     * legacy {@code /topic/games/{gameId}} player-visible broadcast has been
     * removed.
     */
    public void broadcastLeaderboardUpdate(UUID gameId, Object leaderboard) {
        broadcastOperatorOnly(gameId, "leaderboard", leaderboard, true);
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

    /**
     * Submission review events are split across two audiences:
     *
     * <ul>
     *   <li>Operators receive the full payload (points, feedback, reviewer
     *       id) on {@code /topic/games/{gameId}/operator/submission_status}
     *       and via {@link MobileRealtimeHub} filtered to operator
     *       principals. Operators need the scoring fields to drive the
     *       submission review UX.</li>
     *   <li>The owning team receives a sanitized payload with ONLY
     *       {@code id}, {@code teamId}, {@code challengeId}, {@code baseId},
     *       {@code status}, {@code submittedAt} on
     *       {@code /topic/games/{gameId}/team/{teamId}/submission_status}
     *       and via the mobile hub filtered to players on that team. No
     *       {@code points}, {@code feedback}, or {@code reviewedBy} — the
     *       player app must never surface scoring data (per CLAUDE.md
     *       "Players don't see scores or leaderboards").</li>
     * </ul>
     *
     * Both broadcasts share the same stateVersion bump so a single submission
     * review counts as one snapshot-invalidation event for every consumer.
     */
    public void broadcastSubmissionStatus(UUID gameId, Submission submission) {
        Long stateVersion = bumpStateVersion(gameId, "submission_status");

        UUID teamId = submission.getTeam().getId();

        Map<String, Object> operatorData = new HashMap<>();
        operatorData.put("id", submission.getId());
        operatorData.put("teamId", teamId);
        operatorData.put("challengeId", submission.getChallenge().getId());
        operatorData.put("baseId", submission.getBase().getId());
        operatorData.put("status", submission.getStatus().name());
        operatorData.put("submittedAt", submission.getSubmittedAt() != null
                ? submission.getSubmittedAt().toString() : null);
        operatorData.put("reviewedBy", submission.getReviewedBy() != null
                ? submission.getReviewedBy().getId() : null);
        operatorData.put("feedback", submission.getFeedback());
        operatorData.put("points", submission.getPoints());

        // Player-safe projection: no points, no feedback, no reviewer id.
        Map<String, Object> teamData = new HashMap<>();
        teamData.put("id", submission.getId());
        teamData.put("teamId", teamId);
        teamData.put("challengeId", submission.getChallenge().getId());
        teamData.put("baseId", submission.getBase().getId());
        teamData.put("status", submission.getStatus().name());
        teamData.put("submittedAt", submission.getSubmittedAt() != null
                ? submission.getSubmittedAt().toString() : null);

        String operatorDest = "/topic/games/" + gameId + "/operator/submission_status";
        String teamDest = "/topic/games/" + gameId + "/team/" + teamId + "/submission_status";

        Map<String, Object> operatorEnvelope = buildEnvelope(gameId, "submission_status", operatorData, stateVersion);
        Map<String, Object> teamEnvelope = buildEnvelope(gameId, "submission_status", teamData, stateVersion);

        dispatchAfterCommit(() -> {
            log.debug("Broadcasting submission_status operator envelope to {}", operatorDest);
            messagingTemplate.convertAndSend(operatorDest, operatorEnvelope);
            log.debug("Broadcasting submission_status team envelope to {}", teamDest);
            messagingTemplate.convertAndSend(teamDest, teamEnvelope);
            mobileRealtimeHub.broadcastToOperators(gameId, operatorEnvelope);
            mobileRealtimeHub.broadcastToTeam(gameId, teamId, teamEnvelope);
        });
    }

    private void broadcast(UUID gameId, String type, Object data, boolean bumpStateVersion) {
        Long stateVersion = bumpStateVersion ? bumpStateVersion(gameId, type) : null;
        Map<String, Object> payload = buildEnvelope(gameId, type, data, stateVersion);

        dispatchAfterCommit(() -> {
            String destination = "/topic/games/" + gameId;
            log.debug("Broadcasting {} event to {}", type, destination);
            messagingTemplate.convertAndSend(destination, payload);
            mobileRealtimeHub.broadcast(gameId, payload);
        });
    }

    /**
     * Operator-audience variant of {@link #broadcast}. Lands on the
     * {@code /topic/games/{gameId}/operator/{type}} STOMP sub-topic and is
     * filtered to operator principals on the mobile hub. Used for payloads
     * that must never reach player clients (leaderboard today; other
     * sensitive channels can reuse this in future waves).
     */
    private void broadcastOperatorOnly(UUID gameId, String type, Object data, boolean bumpStateVersion) {
        Long stateVersion = bumpStateVersion ? bumpStateVersion(gameId, type) : null;
        Map<String, Object> payload = buildEnvelope(gameId, type, data, stateVersion);

        dispatchAfterCommit(() -> {
            String destination = "/topic/games/" + gameId + "/operator/" + type;
            log.debug("Broadcasting operator-only {} event to {}", type, destination);
            messagingTemplate.convertAndSend(destination, payload);
            mobileRealtimeHub.broadcastToOperators(gameId, payload);
        });
    }

    private Long bumpStateVersion(UUID gameId, String type) {
        try {
            return gameRepository.incrementStateVersion(gameId);
        } catch (Exception ex) {
            // A failed bump must never prevent a broadcast from landing.
            // A dropped bump degrades the snapshot freshness contract
            // (clients might miss a state change) but a dropped broadcast
            // would corrupt live UX. Prefer honest realtime over a
            // version-correct silence.
            log.warn("Failed to bump state_version for game {} on {} event: {}",
                    gameId, type, ex.getMessage());
            return null;
        }
    }

    private Map<String, Object> buildEnvelope(UUID gameId, String type, Object data, Long stateVersion) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("version", EVENT_VERSION);
        payload.put("type", type);
        payload.put("gameId", gameId);
        payload.put("emittedAt", java.time.Instant.now().toString());
        if (stateVersion != null) {
            payload.put("stateVersion", stateVersion);
        }
        payload.put("data", data);
        return payload;
    }

    private void dispatchAfterCommit(Runnable dispatch) {
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
