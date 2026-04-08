package com.prayer.pointfinder.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.*;

@Entity
@Table(name = "games")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class Game {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description;

    @Column(name = "start_date")
    private Instant startDate;

    @Column(name = "end_date")
    private Instant endDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "game_status")
    private GameStatus status;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @ManyToMany
    @JoinTable(
        name = "game_operators",
        joinColumns = @JoinColumn(name = "game_id"),
        inverseJoinColumns = @JoinColumn(name = "user_id")
    )
    @Builder.Default
    private Set<User> operators = new HashSet<>();

    @OneToMany(mappedBy = "game", cascade = {CascadeType.PERSIST, CascadeType.MERGE}, orphanRemoval = true)
    @Builder.Default
    private List<Base> bases = new ArrayList<>();

    @OneToMany(mappedBy = "game", cascade = {CascadeType.PERSIST, CascadeType.MERGE}, orphanRemoval = true)
    @Builder.Default
    private List<Challenge> challenges = new ArrayList<>();

    @OneToMany(mappedBy = "game", cascade = {CascadeType.PERSIST, CascadeType.MERGE}, orphanRemoval = true)
    @Builder.Default
    private List<Team> teams = new ArrayList<>();

    @Column(name = "uniform_assignment", nullable = false)
    @Builder.Default
    private Boolean uniformAssignment = false;

    @Column(name = "broadcast_enabled", nullable = false)
    @Builder.Default
    private Boolean broadcastEnabled = false;

    @Column(name = "broadcast_code", length = 6)
    private String broadcastCode;

    @Column(name = "tile_source", nullable = false, length = 50)
    @Builder.Default
    private String tileSource = "osm-classic";

    @Enumerated(EnumType.STRING)
    @Column(name = "unlock_trigger", nullable = false, length = 20)
    @Builder.Default
    private UnlockTrigger unlockTrigger = UnlockTrigger.CHECK_IN;

    /**
     * Monotonically-increasing state version for the snapshot / realtime
     * recovery contract (P0 Track 2 Slice 1).
     *
     * <p>Bumped by {@code GameEventBroadcaster} via
     * {@code GameRepository.incrementStateVersion} whenever a state-mutating,
     * snapshot-relevant event is broadcast for the game: {@code game_status},
     * {@code game_config}, {@code activity}, {@code submission_status},
     * {@code leaderboard}, {@code notification}. Transient high-frequency
     * events ({@code location}, {@code presence}) deliberately do NOT bump.
     *
     * <p>This is a plain field — NOT a Hibernate {@code @Version} column.
     * JPA optimistic locking would change save semantics at every mutation
     * site, which we explicitly do not want. The increment is performed by a
     * dedicated native UPDATE ... RETURNING statement so it stays atomic under
     * concurrency.
     *
     * <p>Clients store the last version they observed via realtime, then on
     * reconnect / foreground / missed event, call
     * {@code GET /api/games/{id}/snapshot} and compare the snapshot's
     * {@code stateVersion} with their cached value to decide whether to
     * replace cached state wholesale.
     */
    @Column(name = "state_version", nullable = false)
    @Builder.Default
    private Long stateVersion = 0L;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
