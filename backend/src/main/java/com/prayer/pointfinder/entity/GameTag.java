package com.prayer.pointfinder.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * Game-scoped tag entity. Each tag belongs to exactly one game and carries a
 * color so that all bases/challenges using that tag share a consistent visual.
 *
 * <p>Operator-only concept — never exposed to players. See
 * {@code PlayerBaseResponse} / {@code PlayerChallengeResponse} for the
 * player-safe DTOs.
 */
@Entity
@Table(name = "game_tags")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GameTag {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "game_id", nullable = false)
    private Game game;

    @Column(nullable = false, length = 40)
    private String label;

    /** 7-char hex color, e.g. {@code #3b82f6}. Enforced at DTO layer. */
    @Column(nullable = false, length = 7)
    private String color;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
