package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.UploadSessionChunk;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface UploadSessionChunkRepository extends JpaRepository<UploadSessionChunk, UploadSessionChunk.UploadSessionChunkId> {

    @Query("SELECT c.chunkIndex FROM UploadSessionChunk c WHERE c.sessionId = :sessionId ORDER BY c.chunkIndex ASC")
    List<Integer> findUploadedChunkIndexes(@Param("sessionId") UUID sessionId);

    long countBySessionId(UUID sessionId);

    boolean existsBySessionIdAndChunkIndex(UUID sessionId, int chunkIndex);

    void deleteBySessionIdAndChunkIndex(UUID sessionId, int chunkIndex);

    void deleteBySessionId(UUID sessionId);

    /**
     * Records a chunk, replacing an existing record for the same index. Two
     * instances accepting the same chunk concurrently both succeed; the bytes
     * they stored are identical by the size check and the store overwrites.
     */
    @Modifying
    @Query(value = """
            INSERT INTO upload_session_chunks (session_id, chunk_index, chunk_size_bytes, created_at)
            VALUES (:sessionId, :chunkIndex, :chunkSizeBytes, :now)
            ON CONFLICT (session_id, chunk_index) DO UPDATE SET
                chunk_size_bytes = EXCLUDED.chunk_size_bytes,
                created_at = EXCLUDED.created_at
            """, nativeQuery = true)
    void upsertChunk(
            @Param("sessionId") UUID sessionId,
            @Param("chunkIndex") int chunkIndex,
            @Param("chunkSizeBytes") int chunkSizeBytes,
            @Param("now") java.time.Instant now
    );
}
