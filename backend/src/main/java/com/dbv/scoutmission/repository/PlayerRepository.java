package com.dbv.scoutmission.repository;

import com.dbv.scoutmission.entity.Player;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlayerRepository extends JpaRepository<Player, UUID> {

    List<Player> findByTeamId(UUID teamId);

    Optional<Player> findByDeviceIdAndTeamId(String deviceId, UUID teamId);

    Optional<Player> findByToken(String token);

    List<Player> findByTeamGameIdAndPushTokenIsNotNull(UUID gameId);

    List<Player> findByTeamIdAndPushTokenIsNotNull(UUID teamId);
}
