package com.prayer.pointfinder.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Player-facing snapshot response for {@code GET /api/games/{gameId}/snapshot}.
 *
 * <p><strong>PRODUCT RULE — NO SCORES.</strong> Players in PointFinder do not
 * see scores anywhere in the player app: no team score, no leaderboard, no
 * points on submissions (only status: pending/approved/rejected). This DTO
 * must NEVER add {@code score}, {@code points}, {@code leaderboard}, or
 * {@code rank} fields. Scoring is operator-side only. The snapshot contract
 * depends on this shape being structurally score-free — the test suite
 * verifies that the serialized JSON does not contain any of those keys.
 *
 * <p>Source spec: docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md
 * (P0 Track 2 Slice 1).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PlayerSnapshotResponse(
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
        TeamInfo team,
        List<BaseProgressResponse> progress,
        List<PlayerSubmissionSummary> submissions,
        List<UploadSessionResponse> uploadSessions
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
            Boolean enforceBaseOrder,
            @JsonInclude(JsonInclude.Include.ALWAYS) Integer nextRequiredBaseNumber
    ) {
        public GameInfo(UUID id, String name, String description, String status, String unlockTrigger,
                String tileSource, Instant startDate, Instant endDate) {
            this(id, name, description, status, unlockTrigger, tileSource, startDate, endDate, false, null);
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record TeamInfo(
            UUID id,
            String name,
            String color,
            int memberCount
            // NO score field. Players do not see scores.
    ) {}

    /**
     * Player-facing submission summary. Deliberately excludes
     * {@code points} — the submission has a status only, not a score, from
     * the player's perspective.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PlayerSubmissionSummary(
            UUID id,
            UUID baseId,
            UUID challengeId,
            /**
             * One of {@code pending}, {@code approved}, {@code rejected},
             * {@code correct}, {@code incorrect}. NO points.
             */
            String status,
            Instant submittedAt,
            String fileUrl,
            List<String> fileUrls
    ) {}
}
