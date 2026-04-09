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
 *
 * <p>{@code version} is a Hibernate optimistic-lock column (JPA {@code @Version}).
 * Concurrent updates (e.g. two operators editing the same tag label at the same
 * instant) will cause Hibernate to throw
 * {@code ObjectOptimisticLockingFailureException} on the second writer, which
 * {@code GlobalExceptionHandler} maps to HTTP 409 with error code
 * {@code TAG_MODIFIED_CONCURRENTLY}.
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

    /**
     * Hibernate optimistic-lock version. Populated from {@code game_tags.version}
     * (added by V43 migration). Must be 0 for new rows; Flyway backfill sets
     * existing rows to 0 so the column is never null.
     */
    @Version
    @Column(nullable = false)
    @Builder.Default
    private Long version = 0L;

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
