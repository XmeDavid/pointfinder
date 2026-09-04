package com.prayer.pointfinder.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;

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
@JsonInclude(JsonInclude.Include.NON_NULL)
public record OperatorSnapshotResponse(
        /**
         * Monotonically-increasing state version. Bumped by
         * {@code GameEventBroadcaster} on every state-mutating, snapshot-relevant
         * broadcast. Realtime listeners compare this against their last seen
         * version on reconnect to decide whether to replace cached state wholesale.
         */
        long stateVersion,

        /** Server-side wall clock at the moment the snapshot was built. */
        Instant serverTime,

        GameInfo game,
        List<TeamInfo> teams,
        List<LeaderboardEntry> leaderboard,

        /** Count of submissions currently in {@code pending} status. */
        int pendingReviews,

        /**
         * Count of upload sessions currently in {@code active} state that have
         * not yet expired. Mirrors the fleet of in-flight media the operator can
         * expect to see finish.
         */
        int activeUploads,

        /**
         * Count of completed-but-unlinked upload sessions older than
         * {@code app.uploads.needs-attention-threshold-minutes}. Same row set the
         * needs-attention detector alerts on. Zero means "no stuck media".
         */
        int needsAttention
) {

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record GameInfo(
            UUID id,
            String name,
            String description,
            /** Canonical game status: {@code setup}, {@code live}, or {@code ended}. */
            String status,
            /** {@code CHECK_IN}, {@code SUBMISSION}, or {@code COMPLETED}. */
            String unlockTrigger,
            String tileSource,
            Instant startDate,
            Instant endDate,
            Boolean uniformAssignment,
            Boolean broadcastEnabled,
            String broadcastCode
    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record TeamInfo(
            UUID id,
            String name,
            String color,
            long score,
            int memberCount
    ) {}
}
