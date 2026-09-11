package com.prayer.pointfinder.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** One go-live..end run of a game. Awards and saved results belong to a cycle. */
@Entity
@Table(name = "xp_cycles")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class XpCycle {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Null once the game is deleted; the name snapshot keeps the history readable. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "game_id")
    private Game game;

    @Column(name = "game_name", nullable = false)
    private String gameName;

    @Column(nullable = false)
    private int number;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "finalized_at")
    private Instant finalizedAt;

    @Column(name = "invalidated_at")
    private Instant invalidatedAt;

    /** Frozen at go-live from the creator's finalized-XP level; never changes for the cycle. */
    @Column(nullable = false, precision = 6, scale = 4)
    private BigDecimal factor;

    @Builder.Default
    @Column(name = "featured_multiplier", nullable = false, precision = 4, scale = 2)
    private BigDecimal featuredMultiplier = BigDecimal.ONE;

    @Builder.Default
    @Column(name = "formula_version", nullable = false)
    private int formulaVersion = 1;

    public boolean isOpen() { return finalizedAt == null && invalidatedAt == null; }
    public boolean isFinalized() { return finalizedAt != null && invalidatedAt == null; }
}
