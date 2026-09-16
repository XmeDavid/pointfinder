package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.GameLifecycleEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface GameLifecycleEventRepository extends JpaRepository<GameLifecycleEvent, UUID> {

    @Query("SELECT e FROM GameLifecycleEvent e LEFT JOIN FETCH e.actorUser WHERE e.game.id = :gameId ORDER BY e.createdAt ASC, e.id ASC")
    List<GameLifecycleEvent> findByGameIdOrderByCreatedAtAsc(@Param("gameId") UUID gameId);
}
