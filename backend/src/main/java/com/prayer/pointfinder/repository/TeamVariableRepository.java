package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.dto.projection.TeamKeyCount;
import com.prayer.pointfinder.entity.TeamVariable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface TeamVariableRepository extends JpaRepository<TeamVariable, UUID> {

    List<TeamVariable> findByGameId(UUID gameId);

    List<TeamVariable> findByGameIdAndTeamId(UUID gameId, UUID teamId);

    void deleteByGameId(UUID gameId);

    @Query("SELECT new com.prayer.pointfinder.dto.projection.TeamKeyCount(tv.variableKey, COUNT(DISTINCT tv.team.id)) FROM TeamVariable tv WHERE tv.game.id = :gameId GROUP BY tv.variableKey")
    List<TeamKeyCount> countTeamsPerKeyByGameId(@Param("gameId") UUID gameId);
}
