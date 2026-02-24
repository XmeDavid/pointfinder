package com.prayer.pointfinder.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "upload_session_chunks")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@IdClass(UploadSessionChunk.UploadSessionChunkId.class)
public class UploadSessionChunk {

    @Id
    @Column(name = "session_id", nullable = false)
    private UUID sessionId;

    @Id
    @Column(name = "chunk_index", nullable = false)
    private int chunkIndex;

    @Column(name = "chunk_size_bytes", nullable = false)
    private int chunkSizeBytes;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UploadSessionChunkId implements Serializable {
        private UUID sessionId;
        private int chunkIndex;
    }
}
