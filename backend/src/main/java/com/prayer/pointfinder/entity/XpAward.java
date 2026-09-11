package com.prayer.pointfinder.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** One append-only XP ledger row. Amounts are never edited; a reversal is another row. */
@Entity
@Table(name = "xp_awards")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class XpAward {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "cycle_id", nullable = false)
    private XpCycle cycle;

    @Column(name = "game_id")
    private UUID gameId;

    @Column(name = "team_id")
    private UUID teamId;

    @Column(name = "player_id")
    private UUID playerId;

    /** The account at award time; backfilled on claim, cleared on unlink. */
    @Column(name = "user_id")
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private XpAwardKind kind;

    /** The logical thing awarded: a base, or the cycle itself. */
    @Column(name = "reference_id", nullable = false)
    private UUID referenceId;

    @Column(name = "base_amount", nullable = false)
    private int baseAmount;

    @Column(nullable = false, precision = 8, scale = 4)
    private BigDecimal factor;

    @Column(nullable = false)
    private int amount;

    @Builder.Default
    @Column(name = "formula_version", nullable = false)
    private int formulaVersion = 1;

    @Column(name = "awarded_at", nullable = false)
    private Instant awardedAt;
}
