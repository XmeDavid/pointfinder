package com.dbvnfc.repository;

import com.dbvnfc.model.entity.TeamEnigmaAssignment;
import com.dbvnfc.model.entity.TeamEnigmaAssignmentId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TeamEnigmaAssignmentRepository extends JpaRepository<TeamEnigmaAssignment, TeamEnigmaAssignmentId> {

    @Query("SELECT tea FROM TeamEnigmaAssignment tea WHERE tea.teamId = :teamId")
    List<TeamEnigmaAssignment> findByTeamId(@Param("teamId") UUID teamId);

    @Query("SELECT tea FROM TeamEnigmaAssignment tea WHERE tea.teamId = :teamId AND tea.baseId = :baseId")
    Optional<TeamEnigmaAssignment> findByTeamIdAndBaseId(@Param("teamId") UUID teamId, @Param("baseId") String baseId);
}
