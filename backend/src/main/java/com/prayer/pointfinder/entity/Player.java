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

    @Column(name = "device_id", nullable = false)
    private String deviceId;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(unique = true)
    private String token;

    @Column(name = "push_token")
    private String pushToken;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "push_platform", nullable = false)
    private PushPlatform pushPlatform = PushPlatform.ios;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
