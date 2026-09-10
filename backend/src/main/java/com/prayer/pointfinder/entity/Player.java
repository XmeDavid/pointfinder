package com.prayer.pointfinder.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "players")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class Player {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "team_id", nullable = false)
    private Team team;

    /** Denormalized from the team so the one-participation-per-account index can exist. Nullable in the schema for one release (see V73). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "game_id")
    private Game game;

    /** The account this participation belongs to, once claimed. Null for guests. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(name = "device_id", nullable = false)
    private String deviceId;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(name = "push_token")
    private String pushToken;

    @Enumerated(EnumType.STRING)
    @Column(name = "push_platform", nullable = true)
    private PushPlatform pushPlatform;

    @Column(name = "last_notifications_seen_at")
    private Instant lastNotificationsSeenAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
