package com.prayer.pointfinder.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * Reversible operator override that forces a hidden base to become visible
 * to a specific team, regardless of the game's normal unlock trigger.
 *
 * <p>Added in V37 as part of P1 Phase 2 (Operator Rescue). When an active
 * (non-deleted) row exists for a {@code (team_id, base_id)} pair,
 * {@code PlayerService.getProgress} treats the base as visible for that
 * team even if it is marked {@code hidden} and the normal unlock trigger
 * has not yet been satisfied.
 *
 * <p><strong>Soft-delete contract.</strong> Removing an override does NOT
 * delete the row. Instead, {@link #deletedAt}, {@link #deletedByOperator},
 * and {@link #deletedByDisplayNameSnapshot} are populated and the row
 * stays in place for audit reconstruction. The unique constraint on
 * {@code (team_id, base_id)} is a partial index on
 * {@code deleted_at IS NULL}, so a later operator can re-create an
 * override for the same pair without colliding with the historical row.
 *
 * <p><strong>Actor snapshots.</strong> Display names are copied at action
 * time so the audit survives later operator account removal or rename.
 * The FKs to {@link User} are {@code ON DELETE SET NULL} so the audit row
 * outlives later user deletion.
 */
@Entity
@Table(name = "base_unlock_overrides")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class BaseUnlockOverride {

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

    // ── Creator audit snapshot ─────────────────────────────────────────

    /**
     * Operator who created this override. {@code ON DELETE SET NULL} at the
     * schema level so the audit row outlives later operator account removal;
     * the {@link #createdByDisplayNameSnapshot} still answers "who did it?".
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_operator_id")
    private User createdByOperator;

    /**
     * Immutable copy of the operator's display name AT CREATE TIME. Survives
     * later rename or account deletion.
     */
    @Column(name = "created_by_display_name_snapshot", nullable = false)
    private String createdByDisplayNameSnapshot;

    /**
     * Optional free-text justification supplied by the operator. Stored as
     * TEXT; the DTO enforces a 500-character cap.
     */
    @Column(name = "operator_reason", columnDefinition = "TEXT")
    private String operatorReason;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    // ── Soft-delete audit ──────────────────────────────────────────────

    /**
     * When the override was removed. NULL while the override is ACTIVE. A
     * non-null {@code deleted_at} means the override has been reversed and
     * must NOT influence visibility anymore.
     */
    @Column(name = "deleted_at")
    private Instant deletedAt;

    /**
     * Operator who removed the override. NULL while the override is active.
     * Same {@code ON DELETE SET NULL} contract as {@link #createdByOperator}.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "deleted_by_operator_id")
    private User deletedByOperator;

    /**
     * Immutable copy of the removing operator's display name at remove time.
     */
    @Column(name = "deleted_by_display_name_snapshot")
    private String deletedByDisplayNameSnapshot;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }

    /** Convenience: the override is active when it has not been soft-deleted. */
    @Transient
    public boolean isActive() {
        return deletedAt == null;
    }
}
