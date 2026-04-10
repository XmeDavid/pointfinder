package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.Stage;
import com.prayer.pointfinder.entity.TransitionType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface StageRepository extends JpaRepository<Stage, UUID> {

    List<Stage> findByGameIdOrderByOrderIndexAsc(UUID gameId);

    int countByGameId(UUID gameId);

    void deleteByGameId(UUID gameId);

    @Modifying
    @Query("UPDATE Stage s SET s.orderIndex = :orderIndex WHERE s.id = :id AND s.game.id = :gameId")
    void updateOrderIndex(@Param("id") UUID id, @Param("gameId") UUID gameId, @Param("orderIndex") int orderIndex);

    /**
     * Finds stages that are due for scheduled activation: transition type is 'scheduled',
     * not yet active, and scheduledAt is at or before the given cutoff time.
     */
    List<Stage> findByTransitionTypeAndIsActiveAndScheduledAtBefore(
            TransitionType transitionType, boolean isActive, OffsetDateTime before);
}
