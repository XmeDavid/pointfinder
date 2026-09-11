package com.prayer.pointfinder.entity;

import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

/** A team's saved placement for a cycle. Never recomputed, so it can never disagree with its XP. */
@Entity
@Table(name = "xp_results")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class XpResult {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "cycle_id", nullable = false)
    private XpCycle cycle;

    @Column(name = "team_id")
    private UUID teamId;

    @Column(name = "team_name", nullable = false)
    private String teamName;

    private Integer placement;

    @Builder.Default
    @Column(nullable = false)
    private boolean tied = false;

    @Column(nullable = false)
    private int teams;

    @Column(nullable = false)
    private int players;

    @Column(nullable = false)
    private int members;

    @Column(nullable = false)
    private int beaten;

    @Column(nullable = false)
    private long points;

    @Builder.Default
    @Column(nullable = false)
    private boolean completed = false;

    @Column(nullable = false)
    private boolean eligible;

    @Column(name = "ineligible_reason", length = 64)
    private String ineligibleReason;

    @Builder.Default
    @Column(name = "placement_xp", nullable = false)
    private int placementXp = 0;
}
