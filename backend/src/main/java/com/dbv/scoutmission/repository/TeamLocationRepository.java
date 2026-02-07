package com.dbv.scoutmission.repository;

import com.dbv.scoutmission.entity.TeamLocation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface TeamLocationRepository extends JpaRepository<TeamLocation, UUID> {

    @Query("SELECT tl FROM TeamLocation tl WHERE tl.team.game.id = :gameId")
    List<TeamLocation> findByGameId(@Param("gameId") UUID gameId);
}
