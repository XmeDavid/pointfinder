package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.CheckIn;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository for {@link CheckIn} rows.
 *
 * <p><strong>Archive contract (V36).</strong> Game-scoped reads filter
 * {@code c.archived = false} by default so that archived rows from a
 * {@code resetProgress} do not leak into active gameplay queries. The
 * idempotency lookup {@code findByTeamIdAndBaseId} also filters archived,
 * because the unique {@code (team_id, base_id)} index is partial on
 * {@code archived = false} (see V36): an archived check-in must NOT block a
 * fresh check-in after a reset.
 *
 * <p>The {@code *IncludingArchived} variants are reserved for the Phase 3
 * audit export path.
 */
public interface CheckInRepository extends JpaRepository<CheckIn, UUID> {

    @Query("SELECT c FROM CheckIn c WHERE c.team.id = :teamId AND c.archived = false")
    List<CheckIn> findByTeamId(@Param("teamId") UUID teamId);

    @Query("SELECT c FROM CheckIn c WHERE c.game.id = :gameId AND c.team.id = :teamId AND c.archived = false")
    List<CheckIn> findByGameIdAndTeamId(@Param("gameId") UUID gameId, @Param("teamId") UUID teamId);

    /**
     * Active check-in lookup by team + base. Returns only non-archived rows
     * because the unique {@code (team_id, base_id)} index is partial on
     * {@code archived = false}; archived check-ins must not block a fresh
     * one after a reset.
     */
    @Query("SELECT c FROM CheckIn c WHERE c.team.id = :teamId AND c.base.id = :baseId AND c.archived = false")
    Optional<CheckIn> findByTeamIdAndBaseId(@Param("teamId") UUID teamId, @Param("baseId") UUID baseId);

    @Query("SELECT COUNT(c) > 0 FROM CheckIn c WHERE c.team.id = :teamId AND c.base.id = :baseId AND c.archived = false")
    boolean existsByTeamIdAndBaseId(@Param("teamId") UUID teamId, @Param("baseId") UUID baseId);

    @Query("SELECT c FROM CheckIn c LEFT JOIN FETCH c.team LEFT JOIN FETCH c.base " +
           "WHERE c.game.id = :gameId AND c.archived = false ORDER BY c.checkedInAt DESC")
    List<CheckIn> findByGameId(@Param("gameId") UUID gameId, Pageable pageable);

    @Query("SELECT ci FROM CheckIn ci JOIN FETCH ci.team JOIN FETCH ci.base " +
           "WHERE ci.game.id = :gameId AND ci.archived = false")
    List<CheckIn> findByGameIdWithRelations(@Param("gameId") UUID gameId);

    // ── Archive operations (V36) ───────────────────────────────────────

    /**
     * Soft-archives every check-in for a game. Replaces the old
     * {@code deleteByGameId} hard-delete in
     * {@code GameService.updateStatus(resetProgress=true)}.
     */
    @Modifying
    @Query("UPDATE CheckIn c SET c.archived = true WHERE c.game.id = :gameId AND c.archived = false")
    void markArchivedByGameId(@Param("gameId") UUID gameId);

    /**
     * Hard delete by game id. Retained for tooling and tests; the production
     * reset path uses {@link #markArchivedByGameId(UUID)} instead.
     */
    @Modifying
    @Query("DELETE FROM CheckIn c WHERE c.game.id = :gameId")
    void deleteByGameId(@Param("gameId") UUID gameId);

    // ── Audit export reads (Phase 3, anticipated) ──────────────────────

    /**
     * Returns every check-in for the game, including archived rows.
     * Reserved for the Phase 3 audit export path.
     */
    @Query("SELECT c FROM CheckIn c LEFT JOIN FETCH c.team LEFT JOIN FETCH c.base " +
           "WHERE c.game.id = :gameId ORDER BY c.checkedInAt DESC")
    List<CheckIn> findByGameIdIncludingArchived(@Param("gameId") UUID gameId);
}
