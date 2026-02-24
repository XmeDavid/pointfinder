package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.UploadSession;
import com.prayer.pointfinder.entity.UploadSessionStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface UploadSessionRepository extends JpaRepository<UploadSession, UUID> {
    List<UploadSession> findByStatusAndExpiresAtBefore(UploadSessionStatus status, Instant expiresAt);

    long countByPlayerIdAndStatus(UUID playerId, UploadSessionStatus status);

    @Query("""
            SELECT COALESCE(SUM(s.totalSizeBytes), 0)
            FROM UploadSession s
            WHERE s.game.id = :gameId AND s.status = :status
            """)
    long sumTotalSizeByGameAndStatus(@Param("gameId") UUID gameId, @Param("status") UploadSessionStatus status);
}
