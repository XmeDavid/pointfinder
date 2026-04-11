package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.ActivityEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
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

    /**
     * SQL-pushdown audit export read used by {@code AuditExportService}.
     *
     * <p>Every filter is optional; the caller passes {@code null} for any
     * parameter it does not want to apply. Each {@code WHERE} clause is
     * wrapped with a {@code :param IS NULL} guard so JPQL short-circuits the
     * check when the caller is not filtering on that criterion. This keeps
     * the service one round-trip without forcing in-memory post-filtering.
     *
     * <p>The {@code includeArchived} flag controls whether archived rows are
     * returned. When {@code false} (the default for the operator-facing
     * export), archived rows are filtered out at the SQL level. When {@code
     * true} the query reads the full history including rows preserved by a
     * {@code resetProgress=true} reset. Either way, rows are ordered
     * chronologically ascending so the export reads like a linear timeline.
     *
     * <p>Filter semantics:
     *
     * <ul>
     *   <li>{@code gameId} — always required, scopes the read to one game.</li>
     *   <li>{@code from} — inclusive lower bound on {@code timestamp}.</li>
     *   <li>{@code to} — exclusive upper bound on {@code timestamp}.</li>
     *   <li>{@code teamId} — match events whose target team is this team.</li>
     *   <li>{@code playerId} — match events whose player actor FK is this
     *       player. Does NOT search submission {@code submittedByPlayer} joins;
     *       the activity event stream is the canonical audit spine and every
     *       player-initiated action already emits an event with
     *       {@code actor_player_id} set by Phase 1.</li>
     *   <li>{@code operatorId} — match events whose operator actor FK is this
     *       operator. Covers operator review decisions and the Phase 2 rescue
     *       endpoints.</li>
     *   <li>{@code types} — match events whose type is in this set. Null means
     *       no type filter; pass the full set for the same effect.</li>
     *   <li>{@code sourceSurface} — exact string match against the V36
     *       {@code source_surface} column. Null means no filter.</li>
     * </ul>
     *
     * <p>Reserved for Phase 3.
     */
    @Query("SELECT ae FROM ActivityEvent ae " +
            "JOIN FETCH ae.game " +
            "JOIN FETCH ae.team " +
            "LEFT JOIN FETCH ae.base " +
            "LEFT JOIN FETCH ae.challenge " +
            "LEFT JOIN FETCH ae.actorPlayer " +
            "LEFT JOIN FETCH ae.actorOperatorUser " +
            "WHERE ae.game.id = :gameId " +
            "AND (:includeArchived = true OR ae.archived = false) " +
            "AND (:from IS NULL OR ae.timestamp >= :from) " +
            "AND (:to IS NULL OR ae.timestamp < :to) " +
            "AND (:teamId IS NULL OR ae.team.id = :teamId) " +
            "AND (:playerId IS NULL OR ae.actorPlayer.id = :playerId) " +
            "AND (:operatorId IS NULL OR ae.actorOperatorUser.id = :operatorId) " +
            "AND CAST(ae.type AS string) IN :typeNames " +
            "AND (:sourceSurface IS NULL OR ae.sourceSurface = :sourceSurface) " +
            "ORDER BY ae.timestamp ASC")
    List<ActivityEvent> findForAuditExport(
            @Param("gameId") UUID gameId,
            @Param("from") Instant from,
            @Param("to") Instant to,
            @Param("teamId") UUID teamId,
            @Param("playerId") UUID playerId,
            @Param("operatorId") UUID operatorId,
            @Param("typeNames") Collection<String> typeNames,
            @Param("sourceSurface") String sourceSurface,
            @Param("includeArchived") boolean includeArchived);
}
