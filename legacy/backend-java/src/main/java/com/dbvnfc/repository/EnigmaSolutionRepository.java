package com.dbvnfc.repository;

import com.dbvnfc.model.entity.EnigmaSolution;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface EnigmaSolutionRepository extends JpaRepository<EnigmaSolution, UUID> {

    @Query("SELECT es FROM EnigmaSolution es WHERE es.team.id = :teamId AND es.baseId = :baseId")
    List<EnigmaSolution> findByTeamIdAndBaseId(@Param("teamId") UUID teamId, @Param("baseId") String baseId);

    @Query("SELECT es FROM EnigmaSolution es WHERE es.team.id = :teamId AND es.enigmaId = :enigmaId")
    List<EnigmaSolution> findByTeamIdAndEnigmaId(@Param("teamId") UUID teamId, @Param("enigmaId") String enigmaId);
}
