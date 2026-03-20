package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.Submission;
import com.prayer.pointfinder.entity.SubmissionStatus;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SubmissionRepository extends JpaRepository<Submission, UUID> {

    Optional<Submission> findByIdempotencyKey(UUID idempotencyKey);

    @Query("SELECT s FROM Submission s LEFT JOIN FETCH s.team LEFT JOIN FETCH s.challenge LEFT JOIN FETCH s.base WHERE s.team.game.id = :gameId ORDER BY s.submittedAt DESC")
    List<Submission> findByGameId(@Param("gameId") UUID gameId, Pageable pageable);

    @Query("SELECT s FROM Submission s JOIN FETCH s.team JOIN FETCH s.base LEFT JOIN FETCH s.challenge WHERE s.team.game.id = :gameId")
    List<Submission> findByGameIdWithRelations(@Param("gameId") UUID gameId);

    @Query("SELECT s FROM Submission s LEFT JOIN FETCH s.team LEFT JOIN FETCH s.challenge LEFT JOIN FETCH s.base WHERE s.team.id = :teamId")
    List<Submission> findByTeamId(@Param("teamId") UUID teamId);

    @Query("SELECT s FROM Submission s LEFT JOIN FETCH s.team LEFT JOIN FETCH s.challenge LEFT JOIN FETCH s.base WHERE s.team.game.id = :gameId AND s.status = :status")
    List<Submission> findByGameIdAndStatus(@Param("gameId") UUID gameId, @Param("status") SubmissionStatus status);

    @Query("SELECT s.team.id, s.challenge.id, COALESCE(s.points, s.challenge.points), s.submittedAt " +
           "FROM Submission s WHERE s.team.game.id = :gameId " +
           "AND s.status IN (com.prayer.pointfinder.entity.SubmissionStatus.correct, com.prayer.pointfinder.entity.SubmissionStatus.approved) " +
           "AND s.challenge IS NOT NULL")
    List<Object[]> findScoredSubmissionsByGameId(@Param("gameId") UUID gameId);

    @Query("SELECT COUNT(s) FROM Submission s WHERE s.team.game.id = :gameId AND s.status = :status")
    long countByGameIdAndStatus(@Param("gameId") UUID gameId, @Param("status") SubmissionStatus status);

    @Query("SELECT COUNT(s) FROM Submission s WHERE s.team.game.id = :gameId AND s.status IN :statuses")
    long countByGameIdAndStatusIn(@Param("gameId") UUID gameId, @Param("statuses") List<SubmissionStatus> statuses);

    @Query("SELECT COUNT(s) FROM Submission s WHERE s.team.game.id = :gameId")
    long countByGameId(@Param("gameId") UUID gameId);

    long countByBaseId(UUID baseId);

    long countByChallengeId(UUID challengeId);

    boolean existsByTeamGameIdAndFileUrlIn(UUID gameId, List<String> fileUrls);

    boolean existsByTeamIdAndFileUrlIn(UUID teamId, List<String> fileUrls);

    @Query("DELETE FROM Submission s WHERE s.team.game.id = :gameId")
    @org.springframework.data.jpa.repository.Modifying
    void deleteByGameId(@Param("gameId") UUID gameId);
}
