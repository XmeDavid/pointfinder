package com.dbv.scoutmission.repository;

import com.dbv.scoutmission.entity.Player;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface PlayerRepository extends JpaRepository<Player, UUID> {

    List<Player> findByTeamId(UUID teamId);
}
