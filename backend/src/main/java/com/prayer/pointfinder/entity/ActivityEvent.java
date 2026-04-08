package com.prayer.pointfinder.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "activity_events")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class ActivityEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "game_id", nullable = false)
    private Game game;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "activity_event_type")
    private ActivityEventType type;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "team_id", nullable = false)
    private Team team;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "base_id")
    private Base base;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "challenge_id")
    private Challenge challenge;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String message;

    @Column(nullable = false)
    private Instant timestamp;

    // ── Audit Foundation (V36) ─────────────────────────────────────────
    //
    // Activity events get the richest actor capture because the audit
    // export in Phase 3 streams the activity log as the chronological
    // ground truth. Both player and operator actor FKs are present;
    // exactly one is populated per row in practice (player or operator),
    // but the schema does not enforce that so future shared-actor
    // scenarios remain possible. The display-name and device-id snapshots
    // are immutable copies taken at action time so the audit survives
    // later account or device removal.

    /**
     * Player actor for player-initiated events (check-ins, submissions,
     * future team_join/team_switch). NULL for operator actions. ON DELETE
     * SET NULL preserves the audit row when the player is removed.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_player_id")
    private Player actorPlayer;

    /**
     * Operator actor for operator-initiated events (manual check-in,
     * approval, rejection, future operator_override). NULL for player
     * actions.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_operator_user_id")
    private User actorOperatorUser;

    /**
     * Immutable copy of the actor's display name AT ACTION TIME. Survives
     * subsequent renames or account deletion.
     */
    @Column(name = "actor_display_name_snapshot")
    private String actorDisplayNameSnapshot;

    /**
     * Immutable copy of the actor's device id AT ACTION TIME for player
     * actors. Lets the audit answer "which device performed this action?"
     * even after the player row is removed. NULL for operator actors.
     */
    @Column(name = "actor_device_id_snapshot")
    private String actorDeviceIdSnapshot;

    /**
     * Which client surface produced this event. Allowed values today:
     * {@code player_app}, {@code web_admin}, {@code operator_rescue}.
     */
    @Column(name = "source_surface")
    private String sourceSurface;

    /**
     * Soft-archive flag. Replaces the previous hard-delete path on
     * {@code GameService.updateStatus(resetProgress=true)}. Active queries
     * filter {@code archived = false} by default; the Phase 3 audit
     * export reads the full history.
     */
    @Builder.Default
    @Column(name = "archived", nullable = false)
    private boolean archived = false;

    @PrePersist
    protected void onCreate() {
        if (timestamp == null) timestamp = Instant.now();
    }
}
