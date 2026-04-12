package com.prayer.pointfinder.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "resources")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class Resource {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "org_id")
    private Organization organization;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "game_id")
    private Game game;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "folder_id")
    private ResourceFolder folder;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "resource_type")
    private ResourceType type;

    @Column(nullable = false)
    private String name;

    @Column(name = "content_type", nullable = false)
    private String contentType;

    @Column(name = "s3_key")
    private String s3Key;

    @Column(columnDefinition = "TEXT")
    private String content;

    @Column(name = "size_bytes", nullable = false)
    @Builder.Default
    private Long sizeBytes = 0L;

    @Column(name = "shared_with_players", nullable = false)
    @Builder.Default
    private Boolean sharedWithPlayers = false;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
