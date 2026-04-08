package com.prayer.pointfinder.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "upload_sessions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UploadSession {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "game_id", nullable = false)
    private Game game;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "player_id", nullable = false)
    private Player player;

    @Column(name = "original_file_name")
    private String originalFileName;

    @Column(name = "media_item_key", length = 128)
    private String mediaItemKey;

    @Column(name = "content_type", nullable = false)
    private String contentType;

    @Column(name = "total_size_bytes", nullable = false)
    private long totalSizeBytes;

    @Column(name = "chunk_size_bytes", nullable = false)
    private int chunkSizeBytes;

    @Column(name = "total_chunks", nullable = false)
    private int totalChunks;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, columnDefinition = "upload_session_status")
    private UploadSessionStatus status;

    @Column(name = "file_url", columnDefinition = "TEXT")
    private String fileUrl;

    /**
     * Optional FK back to the submission that consumed this completed upload.
     *
     * <p>Populated by {@code PlayerService.submitAnswer} immediately after the
     * submission row is persisted, for every matching completed upload session
     * belonging to the same (player, game). Stays {@code null} for active,
     * expired, cancelled, or abandoned-completed sessions.
     *
     * <p>An old {@code completed} session with a {@code null} submission is NOT a
     * deletion candidate — it is a "needs attention" signal: the player finished
     * the upload but the final submission POST never tied the bytes together.
     * The scheduler in {@code GameSchedulerService.detectNeedsAttentionUploads}
     * surfaces these rows to operators without modifying anything, so the player
     * can always recover their work days or weeks later.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "submission_id")
    private Submission submission;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "completed_at")
    private Instant completedAt;
}
