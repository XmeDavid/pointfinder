package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.UploadSessionChunk;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface UploadSessionChunkRepository extends JpaRepository<UploadSessionChunk, UploadSessionChunk.UploadSessionChunkId> {

    @Query("SELECT c.chunkIndex FROM UploadSessionChunk c WHERE c.sessionId = :sessionId ORDER BY c.chunkIndex ASC")
    List<Integer> findUploadedChunkIndexes(@Param("sessionId") UUID sessionId);

    long countBySessionId(UUID sessionId);

    void deleteBySessionId(UUID sessionId);
}
