package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.BaseUnlockOverride;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository for {@link BaseUnlockOverride} rows.
 *
 * <p><strong>Active contract.</strong> The "active" in these method names
 * means {@code deleted_at IS NULL} — the soft-delete contract described on
 * {@link BaseUnlockOverride}. Every query that drives gameplay visibility
 * filters on {@code deleted_at IS NULL} so that a reversed override no
 * longer influences what the player sees.
 *
 * <p>The {@code findByGame* } full-history variants are intentionally
 * omitted in Phase 2; the Phase 3 audit export will read via explicit
 * all-row queries when it is implemented.
 */
public interface BaseUnlockOverrideRepository extends JpaRepository<BaseUnlockOverride, UUID> {

    /**
     * Active override lookup for a specific team/base pair. Used for
     * idempotent create and for removal.
     */
    @Query("SELECT o FROM BaseUnlockOverride o " +
            "WHERE o.team.id = :teamId AND o.base.id = :baseId AND o.deletedAt IS NULL")
    Optional<BaseUnlockOverride> findActiveByTeamIdAndBaseId(
            @Param("teamId") UUID teamId,
            @Param("baseId") UUID baseId);

    /**
     * All active overrides for a team within a game. Used by the
     * {@code PlayerService.getProgress} visibility check, where one
     * player-visible snapshot is built per call, so a single query covers
     * every hidden base the team currently has unlocked via override.
     */
    @Query("SELECT o FROM BaseUnlockOverride o " +
            "JOIN FETCH o.base " +
            "WHERE o.game.id = :gameId AND o.team.id = :teamId AND o.deletedAt IS NULL")
    List<BaseUnlockOverride> findActiveByGameIdAndTeamId(
            @Param("gameId") UUID gameId,
            @Param("teamId") UUID teamId);

    /**
     * All active overrides for a game, regardless of team. Used by the
     * optional operator listing endpoint.
     */
    @Query("SELECT o FROM BaseUnlockOverride o " +
            "JOIN FETCH o.team JOIN FETCH o.base " +
            "WHERE o.game.id = :gameId AND o.deletedAt IS NULL " +
            "ORDER BY o.createdAt DESC")
    List<BaseUnlockOverride> findActiveByGameId(@Param("gameId") UUID gameId);
}
