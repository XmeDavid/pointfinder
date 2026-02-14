package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.Team;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TeamRepository extends JpaRepository<Team, UUID> {

    List<Team> findByGameId(UUID gameId);

    Optional<Team> findByJoinCode(String joinCode);

    long countByGameId(UUID gameId);
}
