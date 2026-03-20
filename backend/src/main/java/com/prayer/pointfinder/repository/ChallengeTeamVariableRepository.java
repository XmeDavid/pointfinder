package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.dto.projection.TeamKeyCount;
import com.prayer.pointfinder.entity.ChallengeTeamVariable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface ChallengeTeamVariableRepository extends JpaRepository<ChallengeTeamVariable, UUID> {

    List<ChallengeTeamVariable> findByChallengeId(UUID challengeId);

    List<ChallengeTeamVariable> findByChallengeIdAndTeamId(UUID challengeId, UUID teamId);

    void deleteByChallengeId(UUID challengeId);

    @Query("SELECT new com.prayer.pointfinder.dto.projection.TeamKeyCount(ctv.variableKey, COUNT(DISTINCT ctv.team.id)) FROM ChallengeTeamVariable ctv WHERE ctv.challenge.id = :challengeId GROUP BY ctv.variableKey")
    List<TeamKeyCount> countTeamsPerKeyByChallengeId(@Param("challengeId") UUID challengeId);

    @Query("SELECT ctv FROM ChallengeTeamVariable ctv WHERE ctv.challenge.game.id = :gameId")
    List<ChallengeTeamVariable> findByGameId(@Param("gameId") UUID gameId);
}
