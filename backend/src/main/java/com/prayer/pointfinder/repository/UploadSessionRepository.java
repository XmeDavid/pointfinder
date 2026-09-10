package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.UploadSession;
import com.prayer.pointfinder.entity.UploadSessionStatus;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UploadSessionRepository extends JpaRepository<UploadSession, UUID> {
    List<UploadSession> findByStatusAndExpiresAtBefore(UploadSessionStatus status, Instant expiresAt);

    /**
     * Loads a session with a row lock for the rest of the transaction. Used by
     * completion so two instances completing the same session serialise: the
     * second sees {@code completed} after the first commits and returns the
     * same result instead of assembling and storing a second file. The expiry
     * sweep skips locked rows, so it can never expire a session mid-completion.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM UploadSession s WHERE s.id = :id")
    Optional<UploadSession> findByIdForUpdate(@Param("id") UUID id);

    /**
     * Ids of active sessions past their expiry, locked for this transaction,
     * skipping rows another transaction holds (a completion in progress on
     * either instance). Native because JPQL has no {@code SKIP LOCKED}.
     */
    @Query(value = """
            SELECT id FROM upload_sessions
             WHERE status = 'active' AND expires_at < :now
             ORDER BY expires_at
             LIMIT :limit
             FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    List<UUID> findExpiredActiveIdsSkipLocked(@Param("now") Instant now, @Param("limit") int limit);

    /** Same as {@link #findExpiredActiveIdsSkipLocked} scoped to one player in one game. */
    @Query(value = """
            SELECT id FROM upload_sessions
             WHERE game_id = :gameId AND player_id = :playerId
               AND status = 'active' AND expires_at <= :now
             FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    List<UUID> findExpiredActiveIdsForPlayerSkipLocked(
            @Param("gameId") UUID gameId,
            @Param("playerId") UUID playerId,
            @Param("now") Instant now
    );

    /** Status of a session without loading the entity; used by the orphan chunk sweep. */
    @Query("SELECT s.status FROM UploadSession s WHERE s.id = :id")
    Optional<UploadSessionStatus> findStatusById(@Param("id") UUID id);

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

    /**
     * Returns completed upload sessions that have no linked submission and whose
     * completion is older than the given cutoff. Used by the needs-attention
     * detector to surface uploads whose final submission POST never arrived. This
     * query is read-only; the detector must never mutate the returned rows.
     *
     * <p>Ordered ascending by {@code completedAt} so the oldest stuck uploads
     * appear first. Capped at 500 rows to bound a single scheduler tick.
     */
    @Query("""
            SELECT s
            FROM UploadSession s
            WHERE s.status = com.prayer.pointfinder.entity.UploadSessionStatus.completed
              AND s.submission IS NULL
              AND s.completedAt IS NOT NULL
              AND s.completedAt < :olderThan
            ORDER BY s.completedAt ASC
            """)
    List<UploadSession> findCompletedNeedsAttention(
            @Param("olderThan") Instant olderThan,
            Pageable pageable
    );

    default List<UploadSession> findCompletedNeedsAttention(Instant olderThan) {
        return findCompletedNeedsAttention(
                olderThan,
                PageRequest.of(0, 500)
        );
    }

    /**
     * Returns completed upload sessions for a (player, game) whose
     * {@code submission_id} is still NULL. Used by {@code PlayerService} after a
     * new submission is created to populate the FK for every matching media item.
     *
     * <p>The result set is small in practice (at most the number of upload
     * sessions a single player can accumulate in one game) so no paging here.
     */
    @Query("""
            SELECT s
            FROM UploadSession s
            WHERE s.player.id = :playerId
              AND s.game.id = :gameId
              AND s.status = com.prayer.pointfinder.entity.UploadSessionStatus.completed
              AND s.submission IS NULL
            """)
    List<UploadSession> findCompletedUnlinkedByPlayerAndGame(
            @Param("playerId") UUID playerId,
            @Param("gameId") UUID gameId
    );

    /**
     * Counts upload sessions for a game that are currently active (status =
     * {@code active}) and have not yet expired. Used by the operator snapshot
     * endpoint to surface "how many uploads are in flight right now" without
     * pulling the entire row set.
     */
    @Query("""
            SELECT COUNT(s)
            FROM UploadSession s
            WHERE s.game.id = :gameId
              AND s.status = com.prayer.pointfinder.entity.UploadSessionStatus.active
              AND s.expiresAt > :now
            """)
    long countActiveSessionsByGameId(
            @Param("gameId") UUID gameId,
            @Param("now") Instant now
    );

    /**
     * Counts completed-but-unlinked upload sessions for a game whose
     * completion is older than the given cutoff. Mirrors the selection
     * predicate of {@code findCompletedNeedsAttention} but scoped to a single
     * game and returning a scalar. Used by the operator snapshot endpoint.
     */
    @Query("""
            SELECT COUNT(s)
            FROM UploadSession s
            WHERE s.game.id = :gameId
              AND s.status = com.prayer.pointfinder.entity.UploadSessionStatus.completed
              AND s.submission IS NULL
              AND s.completedAt IS NOT NULL
              AND s.completedAt < :olderThan
            """)
    long countNeedsAttentionByGameId(
            @Param("gameId") UUID gameId,
            @Param("olderThan") Instant olderThan
    );
}
