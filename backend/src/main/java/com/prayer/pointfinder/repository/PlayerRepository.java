package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.Player;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlayerRepository extends JpaRepository<Player, UUID> {

    List<Player> findByTeamId(UUID teamId);

    List<Player> findByTeamGameId(UUID gameId);

    Optional<Player> findByUserIdAndGameId(UUID userId, UUID gameId);

    List<Player> findByUserIdOrderByCreatedAtDesc(UUID userId);

    /** Members of a team that a phone can still resolve; retired guest rows (account recovery) do not count. */
    @Query("SELECT COUNT(p) FROM Player p WHERE p.team.id = :teamId AND p.deviceId NOT LIKE 'retired:%'")
    long countByTeamId(@Param("teamId") UUID teamId);

    Optional<Player> findByDeviceIdAndTeamId(String deviceId, UUID teamId);

    Optional<Player> findFirstByDeviceIdAndTeamGameIdOrderByCreatedAtDesc(String deviceId, UUID gameId);

    @Query("""
            SELECT p
            FROM Player p
            JOIN FETCH p.team t
            JOIN FETCH t.game g
            WHERE p.id = :playerId
            """)
    Optional<Player> findAuthPlayerById(@Param("playerId") UUID playerId);

    @Query("SELECT COUNT(DISTINCT p.id) FROM Player p WHERE p.team.game.id = :gameId AND p.deviceId NOT LIKE 'retired:%'")
    long countByGameId(@Param("gameId") UUID gameId);

    @Modifying
    @Query("UPDATE Player p SET p.user = NULL WHERE p.user.id = :userId")
    void unlinkAllForUser(@Param("userId") UUID userId);

    @Modifying
    @Query("UPDATE Player p SET p.pushToken = NULL WHERE p.pushToken = :token")
    void setInvalidPushTokenToNull(@Param("token") String token);
}
