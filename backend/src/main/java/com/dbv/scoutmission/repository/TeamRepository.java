package com.dbv.scoutmission.repository;

import com.dbv.scoutmission.entity.Team;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TeamRepository extends JpaRepository<Team, UUID> {

    List<Team> findByGameId(UUID gameId);

    Optional<Team> findByJoinCode(String joinCode);

    long countByGameId(UUID gameId);
}
