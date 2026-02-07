package com.dbvnfc.repository;

import com.dbvnfc.model.entity.Team;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TeamRepository extends JpaRepository<Team, UUID> {

    Optional<Team> findByInviteCode(String inviteCode);

    @Query("SELECT t FROM Team t WHERE t.game.id = :gameId")
    List<Team> findByGameId(@Param("gameId") UUID gameId);

    @Query("SELECT COUNT(t) FROM Team t WHERE t.game.id = :gameId")
    long countByGameId(@Param("gameId") UUID gameId);
}
