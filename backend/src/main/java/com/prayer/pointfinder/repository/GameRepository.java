package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface GameRepository extends JpaRepository<Game, UUID> {

    List<Game> findByStatus(GameStatus status);

    List<Game> findByStatusAndEndDateBefore(GameStatus status, Instant before);

    @Query("SELECT g FROM Game g WHERE g.createdBy.id = :userId OR :userId IN (SELECT o.id FROM g.operators o)")
    List<Game> findByOperatorOrCreator(@Param("userId") UUID userId);

    @Query("SELECT g FROM Game g JOIN g.operators o WHERE o.id = :userId")
    List<Game> findByOperatorId(@Param("userId") UUID userId);
}
