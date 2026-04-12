package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface GameRepository extends JpaRepository<Game, UUID> {

    /**
     * Fetches the Game row with a {@code SELECT ... FOR UPDATE} database lock.
     * Used by {@link com.prayer.pointfinder.service.GameService#updateStatus} to
     * atomise the go-live readiness check + status write: once a caller holds this
     * lock, no other transaction can modify the row until the outer
     * {@code @Transactional} commits, eliminating the CRITICAL-2 race where a
     * concurrent operator could reset progress between the readiness check and the
     * {@code setStatus} call.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT g FROM Game g WHERE g.id = :id")
    Optional<Game> findByIdForUpdate(@Param("id") UUID id);

    List<Game> findByStatus(GameStatus status);

    List<Game> findByStatusAndEndDateBefore(GameStatus status, Instant before);

    @Query("SELECT g FROM Game g WHERE g.createdBy.id = :userId OR :userId IN (SELECT o.id FROM g.operators o)")
    List<Game> findByOperatorOrCreator(@Param("userId") UUID userId);

    @Query("SELECT g FROM Game g JOIN g.operators o WHERE o.id = :userId")
    List<Game> findByOperatorId(@Param("userId") UUID userId);

    Optional<Game> findByBroadcastCodeAndBroadcastEnabledTrue(String broadcastCode);

    @Query("SELECT COUNT(o) > 0 FROM Game g JOIN g.operators o WHERE g.id = :gameId AND o.id = :userId")
    boolean isUserOperator(@Param("gameId") UUID gameId, @Param("userId") UUID userId);

    boolean existsByCreatedByIdAndStatusNot(@Param("createdById") UUID createdById, @Param("status") GameStatus status);

    /**
     * Atomically bumps {@code games.state_version} by one and returns the new
     * value. Used by {@code GameEventBroadcaster} before every state-mutating,
     * snapshot-relevant broadcast so realtime consumers can detect missed
     * events and trigger a snapshot fetch.
     *
     * <p>Atomicity comes from the single {@code UPDATE ... RETURNING}
     * statement: PostgreSQL takes a row lock on {@code games.id} for the
     * duration of the statement, so concurrent callers serialize and every
     * caller sees a strictly greater value than the caller before it. This is
     * the guarantee the concurrency test locks in.
     *
     * <p>Not marked {@code @Modifying}. Spring Data {@code @Modifying}
     * suppresses the JDBC result set and returns the update count, which
     * throws away the {@code RETURNING} row we need. Hibernate still
     * recognizes the statement as DML and executes it correctly; we just
     * read the returned value through a native scalar query.
     *
     * <p>Callers that need to re-read the {@code Game} entity through JPA in
     * the same transaction must flush/clear the persistence context first, or
     * read the version via {@link #findStateVersionById(UUID)} which bypasses
     * the first-level cache.
     *
     * <p>Returns {@code null} only if the game id does not exist — every real
     * bump is non-null and strictly greater than the pre-bump value.
     */
    @Query(value = "UPDATE games SET state_version = state_version + 1 WHERE id = :gameId RETURNING state_version",
            nativeQuery = true)
    Long incrementStateVersion(@Param("gameId") UUID gameId);

    /**
     * Reads the current {@code state_version} for a game without going through
     * the JPA first-level cache. Useful for snapshot assembly and for tests
     * that need to verify a bump landed.
     */
    @Query(value = "SELECT state_version FROM games WHERE id = :gameId", nativeQuery = true)
    Long findStateVersionById(@Param("gameId") UUID gameId);

    // ── Quota count methods ───────────────────────────────────────────────

    long countByCreatedByIdAndOrganizationIsNullAndStatusIn(UUID userId, List<GameStatus> statuses);

    long countByOrganizationIdAndStatus(UUID orgId, GameStatus status);

    long countByOrganizationIdAndStatusIn(UUID orgId, List<GameStatus> statuses);

    @Query("SELECT COUNT(b) FROM Base b WHERE b.game.id = :gameId")
    long countBasesByGameId(@Param("gameId") UUID gameId);

    @Query("SELECT COUNT(o) FROM Game g JOIN g.operators o WHERE g.id = :gameId")
    long countOperatorsByGameId(@Param("gameId") UUID gameId);

    List<Game> findByOrganizationIdIn(List<UUID> orgIds);
}
