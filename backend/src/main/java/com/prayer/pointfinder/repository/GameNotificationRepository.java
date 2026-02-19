package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.GameNotification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface GameNotificationRepository extends JpaRepository<GameNotification, UUID> {

    List<GameNotification> findByGameIdOrderBySentAtDesc(UUID gameId);

    @Query("SELECT n FROM GameNotification n WHERE n.game.id = :gameId " +
           "AND (n.targetTeam IS NULL OR n.targetTeam.id = :teamId) " +
           "ORDER BY n.sentAt DESC")
    List<GameNotification> findByGameIdForTeam(@Param("gameId") UUID gameId,
                                               @Param("teamId") UUID teamId);

    @Query("SELECT COUNT(n) FROM GameNotification n WHERE n.game.id = :gameId " +
           "AND (n.targetTeam IS NULL OR n.targetTeam.id = :teamId) " +
           "AND n.sentAt > :since")
    long countUnseenForTeam(@Param("gameId") UUID gameId,
                            @Param("teamId") UUID teamId,
                            @Param("since") Instant since);
}
