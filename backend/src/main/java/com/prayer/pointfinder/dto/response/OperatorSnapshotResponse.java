package com.prayer.pointfinder.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Operator-facing snapshot response for {@code GET /api/games/{gameId}/snapshot}.
 *
 * <p>Operators see everything: full game config, all teams with scores, the
 * full leaderboard, pending review counts, and upload observability counters.
 * This is the canonical "give me the current state of this game" call
 * operators reach for on reconnect, foreground, or any time realtime dropped
 * an event.
 *
 * <p>Source spec: docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md
 * (P0 Track 2 Slice 1).
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class OperatorSnapshotResponse {

    /**
     * Monotonically-increasing state version. Bumped by
     * {@code GameEventBroadcaster} on every state-mutating, snapshot-relevant
     * broadcast. Realtime listeners compare this against their last seen
     * version on reconnect to decide whether to replace cached state wholesale.
     */
    private long stateVersion;

    /** Server-side wall clock at the moment the snapshot was built. */
    private Instant serverTime;

    private GameInfo game;
    private List<TeamInfo> teams;
    private List<LeaderboardEntry> leaderboard;

    /** Count of submissions currently in {@code pending} status. */
    private int pendingReviews;

    /**
     * Count of upload sessions currently in {@code active} state that have
     * not yet expired. Mirrors the fleet of in-flight media the operator can
     * expect to see finish.
     */
    private int activeUploads;

    /**
     * Count of completed-but-unlinked upload sessions older than
     * {@code app.uploads.needs-attention-threshold-minutes}. Same row set the
     * needs-attention detector alerts on. Zero means "no stuck media".
     */
    private int needsAttention;

    @Data
    @Builder
    @AllArgsConstructor
    @NoArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class GameInfo {
        private UUID id;
        private String name;
        private String description;
        /** Canonical game status: {@code setup}, {@code live}, or {@code ended}. */
        private String status;
        /** {@code CHECK_IN}, {@code SUBMISSION}, or {@code COMPLETED}. */
        private String unlockTrigger;
        private String tileSource;
        private Instant startDate;
        private Instant endDate;
        private Boolean uniformAssignment;
        private Boolean broadcastEnabled;
        private String broadcastCode;
    }

    @Data
    @Builder
    @AllArgsConstructor
    @NoArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class TeamInfo {
        private UUID id;
        private String name;
        private String color;
        private long score;
        private int memberCount;
    }
}
