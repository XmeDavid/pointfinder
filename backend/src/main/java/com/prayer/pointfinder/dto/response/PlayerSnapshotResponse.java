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
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PlayerSnapshotResponse {

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
    private TeamInfo team;
    private List<BaseProgressResponse> progress;
    private List<PlayerSubmissionSummary> submissions;
    private List<UploadSessionResponse> uploadSessions;

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
        private int memberCount;
        // NO score field. Players do not see scores.
    }

    /**
     * Player-facing submission summary. Deliberately excludes
     * {@code points} — the submission has a status only, not a score, from
     * the player's perspective.
     */
    @Data
    @Builder
    @AllArgsConstructor
    @NoArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class PlayerSubmissionSummary {
        private UUID id;
        private UUID baseId;
        private UUID challengeId;
        /**
         * One of {@code pending}, {@code approved}, {@code rejected},
         * {@code correct}, {@code incorrect}. NO points.
         */
        private String status;
        private Instant submittedAt;
        private String fileUrl;
        private List<String> fileUrls;
    }
}
