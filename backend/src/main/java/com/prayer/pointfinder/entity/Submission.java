package com.prayer.pointfinder.entity;

import com.prayer.pointfinder.converter.StringListJsonConverter;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "submissions")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class Submission {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "team_id", nullable = false)
    private Team team;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "challenge_id", nullable = false)
    private Challenge challenge;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "base_id", nullable = false)
    private Base base;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String answer;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "submission_status")
    private SubmissionStatus status;

    @Column(name = "submitted_at", nullable = false)
    private Instant submittedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reviewed_by")
    private User reviewedBy;

    @Column(columnDefinition = "TEXT")
    private String feedback;

    @Column(name = "file_url", columnDefinition = "TEXT")
    private String fileUrl;

    @Convert(converter = StringListJsonConverter.class)
    @Column(name = "file_urls", columnDefinition = "TEXT")
    private List<String> fileUrls;

    @Column
    private Integer points;

    @Column(name = "idempotency_key", unique = true)
    private UUID idempotencyKey;

    @Version
    private Long version;

    // ── Audit Foundation (V36) ─────────────────────────────────────────
    //
    // The fields below capture WHICH player on the team produced this
    // submission, from WHICH client surface, and (when relevant) WHICH
    // operator created it via a Phase 2 mark-completed flow. They are
    // immutable snapshots copied at action time so the audit trail
    // survives later account deletion or display-name changes.
    //
    // Team-level scoring is unchanged: points still belong to the team and
    // are computed from approved/correct submissions regardless of which
    // player physically tapped the submit button. This is purely audit
    // metadata for the wrong-team and rescue post-mortem cases.

    /**
     * Player who submitted this answer through the player app. NULL when
     * the submission was created by the operator (mark-completed) or by a
     * pre-V36 client. ON DELETE SET NULL so the audit row outlives player
     * removal.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "submitted_by_player_id")
    private Player submittedByPlayer;

    /**
     * Immutable copy of the submitting player's display name AT ACTION
     * TIME. Survives renames and player deletion.
     */
    @Column(name = "submitted_by_display_name_snapshot")
    private String submittedByDisplayNameSnapshot;

    /**
     * Immutable copy of the submitting player's device id AT ACTION TIME.
     * Lets the audit answer "which device produced this submission?" even
     * after the player row is gone.
     */
    @Column(name = "submitted_by_device_id_snapshot")
    private String submittedByDeviceIdSnapshot;

    /**
     * Operator who CREATED this submission via Phase 2's mark-completed
     * rescue flow. Distinct from {@link #reviewedBy}, which captures the
     * REVIEW decision and may belong to a different operator. NULL for
     * organic player submissions.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_operator_id")
    private User createdByOperator;

    /**
     * Immutable copy of the operator's display name AT ACTION TIME, used
     * by the audit export to attribute mark-completed actions even after
     * the operator account is removed.
     */
    @Column(name = "created_by_display_name_snapshot")
    private String createdByDisplayNameSnapshot;

    /**
     * Optional free-text justification supplied by the operator on a
     * mark-completed action. Reserved for Phase 2; populated only by the
     * operator-rescue path.
     */
    @Column(name = "operator_reason", columnDefinition = "TEXT")
    private String operatorReason;

    /**
     * Which client surface produced this submission. Allowed values today:
     * {@code player_app}, {@code web_admin}, {@code operator_rescue}.
     * Plain VARCHAR for forward extensibility without enum migration.
     */
    @Column(name = "source_surface")
    private String sourceSurface;

    /**
     * Soft-archive flag. Replaces the previous hard-delete path on
     * {@code GameService.updateStatus(resetProgress=true)}. Active queries
     * filter {@code archived = false} by default; the audit export path
     * reads everything.
     */
    @Builder.Default
    @Column(name = "archived", nullable = false)
    private boolean archived = false;

    @PrePersist
    protected void onCreate() {
        if (submittedAt == null) submittedAt = Instant.now();
        if (status == null) status = SubmissionStatus.pending;
    }
}
