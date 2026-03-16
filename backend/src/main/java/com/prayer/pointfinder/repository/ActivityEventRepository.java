package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.ActivityEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface ActivityEventRepository extends JpaRepository<ActivityEvent, UUID> {

    /**
     * Fetches recent activity events with all lazy relationships eagerly loaded
     * to avoid N+1 queries on game, team, base, and challenge.
     * Uses Pageable for limiting results (caller should pass PageRequest.of(0, limit)).
     */
    @Query("SELECT ae FROM ActivityEvent ae " +
            "JOIN FETCH ae.game " +
            "JOIN FETCH ae.team " +
            "LEFT JOIN FETCH ae.base " +
            "LEFT JOIN FETCH ae.challenge " +
            "WHERE ae.game.id = :gameId " +
            "ORDER BY ae.timestamp DESC")
    List<ActivityEvent> findRecentByGameId(@Param("gameId") UUID gameId,
                                           org.springframework.data.domain.Pageable pageable);

    void deleteByGameId(UUID gameId);
}
