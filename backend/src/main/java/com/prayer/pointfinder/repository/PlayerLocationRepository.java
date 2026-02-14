package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.PlayerLocation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface PlayerLocationRepository extends JpaRepository<PlayerLocation, UUID> {

    @Query("SELECT pl FROM PlayerLocation pl JOIN FETCH pl.player p JOIN FETCH p.team t WHERE t.game.id = :gameId")
    List<PlayerLocation> findByGameId(@Param("gameId") UUID gameId);
}
