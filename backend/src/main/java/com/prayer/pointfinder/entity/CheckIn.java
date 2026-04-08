package com.prayer.pointfinder.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "check_ins")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class CheckIn {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "game_id", nullable = false)
    private Game game;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "team_id", nullable = false)
    private Team team;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "base_id", nullable = false)
    private Base base;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "player_id", nullable = true)
    private Player player;

    @Column(name = "checked_in_at", nullable = false)
    private Instant checkedInAt;

    // ── Audit Foundation (V36) ─────────────────────────────────────────
    //
    // The fields below capture WHO performed the check-in, from WHICH
    // surface, and (for operator rescues) WHY. They are immutable snapshots
    // copied at action time so the audit trail survives later account or
    // device-id mutations.
    //
    // For player check-ins: actor_device_id_snapshot is populated from the
    // current player.deviceId; actor_operator_user_id is NULL.
    //
    // For operator manual check-ins: actor_operator_user_id points at the
    // signed-in user; actor_display_name_snapshot is the operator's name (or
    // email fallback); operator_reason carries the optional explanation; and
    // player_id is NULL because no player was directly involved.

    /**
     * Operator who performed this check-in, when the check-in came through
     * the operator rescue path. NULL for player-initiated check-ins. The FK
     * is ON DELETE SET NULL so the audit row survives if the operator
     * account is later removed.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_operator_user_id")
    private User actorOperatorUser;

    /**
     * Immutable copy of the actor's display name AT ACTION TIME. We store
     * this even though the live join is available because the audit must
     * survive subsequent renames or account deletion. For player check-ins
     * this mirrors player.displayName at the moment of the call; for
     * operator check-ins it mirrors the operator's user.name (or email).
     */
    @Column(name = "actor_display_name_snapshot")
    private String actorDisplayNameSnapshot;

    /**
     * Immutable copy of the player's device id AT ACTION TIME. This lets us
     * answer "did this device perform this action?" even after the player
     * row is removed. NULL for operator-initiated check-ins where there is
     * no associated device.
     */
    @Column(name = "actor_device_id_snapshot")
    private String actorDeviceIdSnapshot;

    /**
     * Which client surface produced this check-in. Allowed values today:
     * {@code player_app}, {@code web_admin}, {@code operator_rescue}.
     * Stored as plain VARCHAR rather than a Postgres enum so future phases
     * can extend the set without an enum migration.
     */
    @Column(name = "source_surface")
    private String sourceSurface;

    /**
     * Optional free-text justification supplied by the operator on a manual
     * check-in. NULL when no reason was provided or for player check-ins.
     */
    @Column(name = "operator_reason", columnDefinition = "TEXT")
    private String operatorReason;

    /**
     * Soft-archive flag. Replaces the previous hard-delete path on
     * {@code GameService.updateStatus(resetProgress=true)}. Active queries
     * filter {@code archived = false} by default; the audit export path
     * reads everything. The unique {@code (team_id, base_id)} constraint is
     * partial on {@code archived = false}, so a fresh check-in can replace
     * an archived one without collision.
     */
    @Builder.Default
    @Column(name = "archived", nullable = false)
    private boolean archived = false;

    @PrePersist
    protected void onCreate() {
        if (checkedInAt == null) checkedInAt = Instant.now();
    }
}
