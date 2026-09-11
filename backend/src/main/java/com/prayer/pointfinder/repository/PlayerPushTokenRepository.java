package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.PlayerPushToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface PlayerPushTokenRepository extends JpaRepository<PlayerPushToken, UUID> {

    List<PlayerPushToken> findByPlayerId(UUID playerId);

    void deleteByPlayerId(UUID playerId);

    List<PlayerPushToken> findByPlayerTeamId(UUID teamId);

    @Query("SELECT t FROM PlayerPushToken t WHERE t.player.team.game.id = :gameId")
    List<PlayerPushToken> findByGameId(@Param("gameId") UUID gameId);

    /** A provider rejected this token: drop it from every phone that registered it. */
    @Modifying
    @Query("DELETE FROM PlayerPushToken t WHERE t.token = :token")
    void deleteByToken(@Param("token") String token);
}
