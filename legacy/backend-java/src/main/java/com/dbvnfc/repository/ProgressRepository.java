package com.dbvnfc.repository;

import com.dbvnfc.model.entity.Progress;
import com.dbvnfc.model.entity.ProgressId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface ProgressRepository extends JpaRepository<Progress, ProgressId> {

    @Query("SELECT p FROM Progress p WHERE p.id.teamId = :teamId")
    List<Progress> findByTeamId(@Param("teamId") UUID teamId);

    @Query("SELECT p FROM Progress p WHERE p.id.teamId = :teamId AND p.id.baseId = :baseId")
    Progress findByTeamIdAndBaseId(@Param("teamId") UUID teamId, @Param("baseId") String baseId);
}
