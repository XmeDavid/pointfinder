package com.prayer.pointfinder.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * One operator's progress through one guided tutorial scenario.
 *
 * <p>{@code gameId} is a soft pointer to the game a {@code setup-game} scenario
 * was bound to. It is a plain column rather than a {@code @ManyToOne} because
 * the client treats a missing or no-longer-in-setup game as "ask again", and
 * loading a whole game to render a library card would be wasteful.
 */
@Entity
@Table(name = "user_tutorial_progress")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserTutorialProgress {

    @EmbeddedId
    private UserTutorialProgressId id;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private TutorialStatus status;

    @Column(name = "current_step", length = 64)
    private String currentStep;

    @Column(name = "game_id")
    private UUID gameId;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
