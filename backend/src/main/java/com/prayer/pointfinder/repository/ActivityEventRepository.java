package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.ActivityEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

/**
 * Repository for {@link ActivityEvent} rows.
 *
 * <p><strong>Archive contract (V36).</strong> The default activity feed query
 * filters {@code ae.archived = false} so that a {@code resetProgress} can
 * preserve the audit trail without polluting the live operator activity view.
 * The {@code *IncludingArchived} variant is reserved for the Phase 3 audit
 * export path.
 */
public interface ActivityEventRepository extends JpaRepository<ActivityEvent, UUID> {

    /**
     * Fetches recent ACTIVE activity events with all lazy relationships
     * eagerly loaded to avoid N+1 queries on game, team, base, and challenge.
     * Uses Pageable for limiting results (caller should pass
     * {@code PageRequest.of(0, limit)}).
     */
    @Query("SELECT ae FROM ActivityEvent ae " +
            "JOIN FETCH ae.game " +
            "JOIN FETCH ae.team " +
            "LEFT JOIN FETCH ae.base " +
            "LEFT JOIN FETCH ae.challenge " +
            "WHERE ae.game.id = :gameId AND ae.archived = false " +
            "ORDER BY ae.timestamp DESC")
    List<ActivityEvent> findRecentByGameId(@Param("gameId") UUID gameId,
                                           org.springframework.data.domain.Pageable pageable);

    // ── Archive operations (V36) ───────────────────────────────────────

    /**
     * Soft-archives every activity event for a game. Replaces the old
     * {@code deleteByGameId} hard-delete in
     * {@code GameService.updateStatus(resetProgress=true)}.
     */
    @Modifying
    @Query("UPDATE ActivityEvent ae SET ae.archived = true WHERE ae.game.id = :gameId AND ae.archived = false")
    void markArchivedByGameId(@Param("gameId") UUID gameId);

    /**
     * Hard delete by game id. Retained for tooling and tests; the production
     * reset path uses {@link #markArchivedByGameId(UUID)} instead.
     */
    @Modifying
    @Query("DELETE FROM ActivityEvent ae WHERE ae.game.id = :gameId")
    void deleteByGameId(@Param("gameId") UUID gameId);

    // ── Audit export reads (Phase 3, anticipated) ──────────────────────

    /**
     * Returns every activity event for the game, including archived rows,
     * ordered by ascending timestamp so the audit export can stream the
     * chronological log directly. Reserved for Phase 3.
     */
    @Query("SELECT ae FROM ActivityEvent ae " +
            "JOIN FETCH ae.game " +
            "JOIN FETCH ae.team " +
            "LEFT JOIN FETCH ae.base " +
            "LEFT JOIN FETCH ae.challenge " +
            "WHERE ae.game.id = :gameId " +
            "ORDER BY ae.timestamp ASC")
    List<ActivityEvent> findByGameIdIncludingArchived(@Param("gameId") UUID gameId);
}
