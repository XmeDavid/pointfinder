package com.dbvnfc.repository;

import com.dbvnfc.model.entity.TeamLocation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface TeamLocationRepository extends JpaRepository<TeamLocation, UUID> {

    @Query("SELECT tl FROM TeamLocation tl WHERE tl.team.id = :teamId ORDER BY tl.createdAt DESC")
    List<TeamLocation> findByTeamIdOrderByCreatedAtDesc(@Param("teamId") UUID teamId);

    @Query(value = "SELECT DISTINCT ON (team_id) * FROM team_locations " +
                   "WHERE team_id IN (SELECT id FROM teams WHERE game_id = :gameId) " +
                   "ORDER BY team_id, created_at DESC",
           nativeQuery = true)
    List<TeamLocation> findLatestLocationsByGameId(@Param("gameId") UUID gameId);
}
