package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.Player;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlayerRepository extends JpaRepository<Player, UUID> {

    List<Player> findByTeamId(UUID teamId);

    Optional<Player> findByDeviceIdAndTeamId(String deviceId, UUID teamId);

    Optional<Player> findFirstByDeviceIdAndTeamGameIdOrderByCreatedAtDesc(String deviceId, UUID gameId);

    Optional<Player> findByToken(String token);

    List<Player> findByTeamGameIdAndPushTokenIsNotNull(UUID gameId);

    List<Player> findByTeamIdAndPushTokenIsNotNull(UUID teamId);

    @Query("""
            SELECT p
            FROM Player p
            JOIN FETCH p.team t
            JOIN FETCH t.game g
            WHERE p.id = :playerId
            """)
    Optional<Player> findAuthPlayerById(@Param("playerId") UUID playerId);
}
