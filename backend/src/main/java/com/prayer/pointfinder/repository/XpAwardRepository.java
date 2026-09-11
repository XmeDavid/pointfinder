package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.XpAward;
import com.prayer.pointfinder.entity.XpAwardKind;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface XpAwardRepository extends JpaRepository<XpAward, UUID> {

    List<XpAward> findByCycleIdAndPlayerId(UUID cycleId, UUID playerId);

    List<XpAward> findByPlayerIdOrderByAwardedAtDesc(UUID playerId);

    List<XpAward> findByUserIdOrderByAwardedAtDesc(UUID userId);

    /** Only finalized, non-reversed cycles seed the creator factor for another game. */
    @Query("SELECT COALESCE(SUM(a.amount), 0) FROM XpAward a WHERE a.userId = :userId AND a.cycle.finalizedAt IS NOT NULL AND a.cycle.invalidatedAt IS NULL")
    long finalizedTotalForUser(@Param("userId") UUID userId);

    /** Action XP is visible as it is earned; reversals remain part of the total. */
    @Query("SELECT COALESCE(SUM(a.amount), 0) FROM XpAward a WHERE a.userId = :userId AND a.cycle.invalidatedAt IS NULL")
    long earnedTotalForUser(@Param("userId") UUID userId);

    @Query("SELECT a FROM XpAward a JOIN FETCH a.cycle c LEFT JOIN FETCH c.game WHERE a.userId = :userId AND c.invalidatedAt IS NULL ORDER BY a.awardedAt DESC")
    List<XpAward> earnedForUser(@Param("userId") UUID userId);

    /** Everyone who earned anything in a cycle, with their total, for reversals. */
    @Query("SELECT a.playerId, SUM(a.amount) FROM XpAward a WHERE a.cycle.id = :cycleId AND a.playerId IS NOT NULL GROUP BY a.playerId")
    List<Object[]> earnedPerPlayerInCycle(@Param("cycleId") UUID cycleId);

    @Query("SELECT COALESCE(SUM(a.amount), 0) FROM XpAward a WHERE a.playerId = :playerId")
    long totalForPlayer(@Param("playerId") UUID playerId);

    @Query("SELECT COALESCE(SUM(a.amount), 0) FROM XpAward a WHERE a.cycle.id = :cycleId AND a.playerId = :playerId")
    long totalForPlayerInCycle(@Param("cycleId") UUID cycleId, @Param("playerId") UUID playerId);

    /** A claim attaches the participation's history to the account; an unlink detaches it. */
    @Modifying
    @Query("UPDATE XpAward a SET a.userId = :userId WHERE a.playerId = :playerId")
    int reassignPlayer(@Param("playerId") UUID playerId, @Param("userId") UUID userId);
}
