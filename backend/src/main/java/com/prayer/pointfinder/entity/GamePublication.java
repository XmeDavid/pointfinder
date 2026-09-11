package com.prayer.pointfinder.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * PF-07: the deliberate public summary of a game. One per game. The row
 * existing means a draft exists; {@link #publishedAt} set means it is listed.
 * {@link #title} mirrors the game name at the last save and is never read
 * for a response: every listing derives its title from the current
 * {@code game.name}, so a rename stays consistent without a resave.
 * {@link #place} is an area label; coordinates are optional and never a base.
 * {@link #admissionTeam} is the one team Explore may place new accounts on;
 * null means the listing is informational and a join code is required.
 */
@Entity
@Table(name = "game_publications")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class GamePublication {

    @Id
    @Column(name = "game_id")
    private UUID gameId;

    @OneToOne(fetch = FetchType.LAZY)
    @MapsId
    @JoinColumn(name = "game_id")
    private Game game;

    /** Mirror of the game name at last save (V78: 255, the bound of {@code games.name}); never read for a response. */
    @Column(nullable = false, length = 255)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String summary;

    @Column(nullable = false, length = 120)
    private String place;

    private Double lat;

    private Double lng;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    @Builder.Default
    private PublicationCategory category = PublicationCategory.other;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "admission_team_id")
    private Team admissionTeam;

    @Column(name = "published_at")
    private Instant publishedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "published_by")
    private User publishedBy;

    @Column(nullable = false)
    @Builder.Default
    private Boolean featured = false;

    @Column(name = "featured_at")
    private Instant featuredAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "featured_by")
    private User featuredBy;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public boolean isListed() {
        return publishedAt != null;
    }
}
