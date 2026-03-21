package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.Assignment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AssignmentRepository extends JpaRepository<Assignment, UUID> {

    @Query("SELECT a FROM Assignment a LEFT JOIN FETCH a.base LEFT JOIN FETCH a.challenge WHERE a.game.id = :gameId")
    List<Assignment> findByGameId(@Param("gameId") UUID gameId);

    @Query("SELECT a FROM Assignment a LEFT JOIN FETCH a.team LEFT JOIN FETCH a.base LEFT JOIN FETCH a.challenge WHERE a.game.id = :gameId")
    List<Assignment> findByGameIdWithRelations(@Param("gameId") UUID gameId);

    @Query("SELECT a FROM Assignment a LEFT JOIN FETCH a.base LEFT JOIN FETCH a.challenge WHERE a.game.id = :gameId AND (a.team.id = :teamId OR a.team IS NULL)")
    List<Assignment> findByGameIdAndTeamId(@Param("gameId") UUID gameId, @Param("teamId") UUID teamId);

    List<Assignment> findByBaseId(UUID baseId);

    boolean existsByGameIdAndBaseIdAndTeamId(UUID gameId, UUID baseId, UUID teamId);

    boolean existsByGameIdAndBaseIdAndTeamIdIsNull(UUID gameId, UUID baseId);

    boolean existsByGameIdAndBaseIdAndTeamIdIsNotNull(UUID gameId, UUID baseId);

    Optional<Assignment> findByIdAndGameId(UUID id, UUID gameId);

    boolean existsByGameIdAndChallengeIdAndTeamId(UUID gameId, UUID challengeId, UUID teamId);

    boolean existsByGameIdAndChallengeIdAndTeamIdIsNull(UUID gameId, UUID challengeId);

    void deleteByGameId(UUID gameId);
}
