package com.dbv.scoutmission.repository;

import com.dbv.scoutmission.entity.Submission;
import com.dbv.scoutmission.entity.SubmissionStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SubmissionRepository extends JpaRepository<Submission, UUID> {

    Optional<Submission> findByIdempotencyKey(UUID idempotencyKey);

    @Query("SELECT s FROM Submission s WHERE s.team.game.id = :gameId")
    List<Submission> findByGameId(@Param("gameId") UUID gameId);

    List<Submission> findByTeamId(UUID teamId);

    @Query("SELECT s FROM Submission s WHERE s.team.game.id = :gameId AND s.status = :status")
    List<Submission> findByGameIdAndStatus(@Param("gameId") UUID gameId, @Param("status") SubmissionStatus status);

    @Query("SELECT COUNT(s) FROM Submission s WHERE s.team.game.id = :gameId AND s.status = :status")
    long countByGameIdAndStatus(@Param("gameId") UUID gameId, @Param("status") SubmissionStatus status);

    @Query("SELECT COUNT(s) FROM Submission s WHERE s.team.game.id = :gameId")
    long countByGameId(@Param("gameId") UUID gameId);

    @Query("DELETE FROM Submission s WHERE s.team.game.id = :gameId")
    @org.springframework.data.jpa.repository.Modifying
    void deleteByGameId(@Param("gameId") UUID gameId);
}
