package com.prayer.pointfinder.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * PF-07: one audit row per change to a game's public listing, carrying who
 * did it. {@code actorNameSnapshot} survives the account being deleted.
 * {@code team} is the direct-joining team for admission changes; on the other
 * operations it is null.
 */
@Entity
@Table(name = "game_publication_events")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class GamePublicationEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "game_id", nullable = false)
    private Game game;

    @Column(nullable = false, length = 32)
    private String operation;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_user_id")
    private User actorUser;

    @Column(name = "actor_name_snapshot", nullable = false)
    private String actorNameSnapshot;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "team_id")
    private Team team;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "previous_team_id")
    private Team previousTeam;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
