package com.prayer.pointfinder.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.UUID;

/**
 * Uniform audit entry shape emitted by the P1 Phase 3 activity audit export
 * endpoint. A single export row represents one chronological action on the
 * game: a player check-in, a player submission, an operator review decision,
 * an operator rescue action, or a future membership-history event.
 *
 * <p>Every action type is flattened into the same envelope so external
 * consumers (incident reviewers, post-event analysts, operator UI) can parse
 * the export with one pass instead of branching per type. The nested
 * {@link Actor}, {@link Target}, and {@link Details} blocks keep the
 * structured data grouped for the JSON representation; the CSV adapter flattens
 * them into a flat column set with a stable column order.
 *
 * <p>All snapshot fields are taken directly from V36 immutable columns on
 * {@link com.prayer.pointfinder.entity.ActivityEvent}. When a snapshot column
 * is {@code null} (pre-V36 legacy rows), the service falls back to the live
 * join on the actor FK and finally to the literal string {@code "Unknown"} if
 * no actor information is recoverable.
 */
@JsonInclude(JsonInclude.Include.ALWAYS)
public record AuditEntryDto(
        /** Activity event id — stable even across archive/restore cycles. */
        UUID id,

        /** Wall-clock timestamp of the action. Chronological export order key. */
        Instant timestamp,

        /**
         * Action type — one of {@code check_in}, {@code submission}, {@code
         * approval}, {@code rejection}, {@code operator_override}, {@code
         * team_join}, {@code team_switch}. Matches
         * {@link com.prayer.pointfinder.entity.ActivityEventType}.
         */
        String type,

        /**
         * Which client surface produced the event. One of {@code player_app},
         * {@code web_admin}, {@code operator_rescue}, or {@code null} for pre-V36
         * rows that predate source-surface capture.
         */
        String sourceSurface,

        Actor actor,

        Target target,

        Details details,

        /**
         * Whether the row was preserved by a {@code resetProgress=true} reset on
         * the game. Default exports hide archived rows; the {@code
         * includeArchived=true} query param surfaces them for incident review.
         */
        boolean archived
) {

    /**
     * Identity of who performed the action. Exactly one of {@code player},
     * {@code operator}, or {@code system} is populated in practice, but the
     * wire shape stays uniform so consumers can handle all three with one
     * parser.
     */
    public record Actor(
            /**
             * {@code player} for player-initiated events, {@code operator} for
             * operator-initiated events, {@code system} for rows where no actor FK
             * is recoverable (legacy rows and future system-emitted events).
             */
            String type,

            /**
             * Actor UUID from the V36 FK columns ({@code actor_player_id} or
             * {@code actor_operator_user_id}). Null for {@code system} actor or
             * legacy rows where the FK was never populated.
             */
            UUID id,

            /**
             * Immutable snapshot of the actor's display name at action time.
             * Falls back to the live join if the V36 snapshot column is null; if
             * both are null the service emits {@code "Unknown"} rather than
             * leaving the field empty.
             */
            String displayName,

            /**
             * Player-only: immutable device id snapshot at action time. Answers
             * "which device performed this action?" even after the player row is
             * removed. Null for operator actors and pre-V36 rows.
             */
            String deviceId
    ) {}

    /**
     * The target of the action — team is always present because every
     * activity event is team-scoped, base and challenge are populated when
     * the action type naturally has them.
     */
    public record Target(
            TeamRef team,
            BaseRef base,
            ChallengeRef challenge
    ) {}

    public record TeamRef(
            UUID id,
            String name
    ) {}

    public record BaseRef(
            UUID id,
            String name
    ) {}

    public record ChallengeRef(
            UUID id,
            String title
    ) {}

    /**
     * Free-text narration of the event. {@code message} is the existing
     * activity-feed string stored on {@link
     * com.prayer.pointfinder.entity.ActivityEvent}. {@code operatorReason} is
     * only populated for operator-rescue events where the operator supplied
     * an explanation via the Phase 2 rescue request bodies; the service joins
     * the activity event back to the companion {@link
     * com.prayer.pointfinder.entity.Submission} or {@link
     * com.prayer.pointfinder.entity.CheckIn} row to surface it.
     */
    public record Details(
            String message,
            String operatorReason,
            /** {@code NFC}, {@code QR}, {@code LOCATION}; null for non-check-in rows. */
            String checkInMethod,
            /** {@code VERIFIED}, {@code CLAIMED}, {@code OPERATOR}; null otherwise. */
            String checkInVerification,
            /**
             * The geo proof and teammate snapshot as one JSON blob, so an
             * incident reviewer sees exactly what the phone reported rather
             * than a verdict derived from it. Null for token proofs and
             * operator rescues, which have no fix to show.
             */
            String checkInProof
    ) {}
}
