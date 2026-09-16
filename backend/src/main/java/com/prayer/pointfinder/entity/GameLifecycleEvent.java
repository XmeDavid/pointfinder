package com.prayer.pointfinder.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * OW-14: one audit row per game lifecycle transition. {@code reason} says
 * which path made it: {@code operator} (with the acting account),
 * {@code scheduled_end} (end date passed) or {@code practice_expired}.
 * {@code actorNameSnapshot} survives the account being deleted.
 */
@Entity
@Table(name = "game_lifecycle_events")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class GameLifecycleEvent {

    public static final String REASON_OPERATOR = "operator";
    public static final String REASON_SCHEDULED_END = "scheduled_end";
    public static final String REASON_PRACTICE_EXPIRED = "practice_expired";

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "game_id", nullable = false)
    private Game game;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", nullable = false, length = 16)
    private GameStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", nullable = false, length = 16)
    private GameStatus toStatus;

    @Column(nullable = false, length = 32)
    private String reason;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_user_id")
    private User actorUser;

    @Column(name = "actor_name_snapshot")
    private String actorNameSnapshot;

    @Column(name = "reset_progress", nullable = false)
    @Builder.Default
    private boolean resetProgress = false;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
