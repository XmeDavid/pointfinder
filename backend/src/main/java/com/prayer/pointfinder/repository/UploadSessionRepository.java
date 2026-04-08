package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.UploadSession;
import com.prayer.pointfinder.entity.UploadSessionStatus;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface UploadSessionRepository extends JpaRepository<UploadSession, UUID> {
    List<UploadSession> findByStatusAndExpiresAtBefore(UploadSessionStatus status, Instant expiresAt);

    @Query("""
            SELECT COUNT(s)
            FROM UploadSession s
            WHERE s.player.id = :playerId
              AND s.status = :status
              AND s.expiresAt > :now
            """)
    long countActiveSessionsByPlayerId(
            @Param("playerId") UUID playerId,
            @Param("status") UploadSessionStatus status,
            @Param("now") Instant now
    );

    @Query("""
            SELECT COALESCE(SUM(s.totalSizeBytes), 0)
            FROM UploadSession s
            WHERE s.game.id = :gameId
              AND s.status = :status
              AND s.expiresAt > :now
            """)
    long sumActiveBytesByGame(
            @Param("gameId") UUID gameId,
            @Param("status") UploadSessionStatus status,
            @Param("now") Instant now
    );

    @Query("""
            SELECT s
            FROM UploadSession s
            WHERE s.game.id = :gameId
              AND s.player.id = :playerId
              AND s.mediaItemKey = :mediaItemKey
              AND s.status IN :statuses
            ORDER BY s.createdAt DESC
            """)
    List<UploadSession> findRecoverableSessionsByMediaItemKey(
            @Param("gameId") UUID gameId,
            @Param("playerId") UUID playerId,
            @Param("mediaItemKey") String mediaItemKey,
            @Param("statuses") Collection<UploadSessionStatus> statuses,
            Pageable pageable
    );

    @Query("""
            SELECT s
            FROM UploadSession s
            WHERE s.game.id = :gameId
              AND s.player.id = :playerId
              AND s.status = :status
              AND s.expiresAt <= :now
            """)
    List<UploadSession> findExpiredActiveSessionsForPlayerInGame(
            @Param("gameId") UUID gameId,
            @Param("playerId") UUID playerId,
            @Param("status") UploadSessionStatus status,
            @Param("now") Instant now
    );

    @Query("""
            SELECT s
            FROM UploadSession s
            WHERE s.game.id = :gameId
              AND s.player.id = :playerId
              AND (
                    (s.status = :activeStatus AND s.expiresAt > :now)
                    OR s.status = :completedStatus
              )
            ORDER BY s.updatedAt DESC, s.createdAt DESC
            """)
    List<UploadSession> findRecoverableSessionsForPlayerInGame(
            @Param("gameId") UUID gameId,
            @Param("playerId") UUID playerId,
            @Param("activeStatus") UploadSessionStatus activeStatus,
            @Param("completedStatus") UploadSessionStatus completedStatus,
            @Param("now") Instant now,
            Pageable pageable
    );

    @Query("""
            SELECT s
            FROM UploadSession s
            WHERE s.game.id = :gameId
              AND s.player.id = :playerId
              AND s.status IN :statuses
              AND (:mediaItemKey IS NULL OR s.mediaItemKey = :mediaItemKey)
            """)
    List<UploadSession> findClearableSessionsForPlayerInGame(
            @Param("gameId") UUID gameId,
            @Param("playerId") UUID playerId,
            @Param("mediaItemKey") String mediaItemKey,
            @Param("statuses") Collection<UploadSessionStatus> statuses
    );

    @Modifying
    @Query("DELETE FROM UploadSession s WHERE s.game.id = :gameId")
    void deleteByGameId(@Param("gameId") UUID gameId);
}
