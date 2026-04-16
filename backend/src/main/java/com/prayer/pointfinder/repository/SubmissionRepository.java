package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.Submission;
import com.prayer.pointfinder.entity.SubmissionStatus;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository for {@link Submission} rows.
 *
 * <p><strong>Archive contract (V36).</strong> Every game-scoped read query in
 * this repository filters {@code s.archived = false} by default. The
 * {@code GameService.updateStatus(resetProgress=true)} path soft-archives
 * submissions instead of deleting them so the audit trail survives a reset;
 * archived rows must NOT leak into active queries (leaderboards, snapshot,
 * monitoring, etc.). The {@code *IncludingArchived} variants are reserved for
 * the Phase 3 audit export path, which deliberately reads the full history.
 */
public interface SubmissionRepository extends JpaRepository<Submission, UUID> {

    /**
     * Idempotency lookup scoped to the owning team. Replaces the pre-V54
     * globally-unique variant {@code findByIdempotencyKey} which allowed any
     * player to replay another team's submission by reusing the idempotency
     * key. Always prefer this method on the ingestion path; the hit-path
     * associations-fetching variant below avoids the N+1 when the response
     * needs to be rendered immediately.
     */
    Optional<Submission> findByTeamIdAndIdempotencyKey(UUID teamId, UUID idempotencyKey);

    /**
     * Idempotency hit-path lookup that also eagerly fetches the associations
     * needed to build a {@code SubmissionResponse} without triggering lazy
     * loading after the transaction closes. The fan-out joins mirror
     * {@link #findByGameId(UUID, Pageable)} so the hit path stays in a single
     * round-trip.
     */
    @Query("SELECT s FROM Submission s " +
           "JOIN FETCH s.team t JOIN FETCH t.game " +
           "JOIN FETCH s.challenge JOIN FETCH s.base " +
           "WHERE t.id = :teamId AND s.idempotencyKey = :idempotencyKey")
    Optional<Submission> findByTeamIdAndIdempotencyKeyWithAssociations(
            @Param("teamId") UUID teamId,
            @Param("idempotencyKey") UUID idempotencyKey);

    @Query("SELECT s FROM Submission s LEFT JOIN FETCH s.team LEFT JOIN FETCH s.challenge LEFT JOIN FETCH s.base " +
           "WHERE s.team.game.id = :gameId AND s.archived = false ORDER BY s.submittedAt DESC")
    List<Submission> findByGameId(@Param("gameId") UUID gameId, Pageable pageable);

    @Query("SELECT s FROM Submission s JOIN FETCH s.team JOIN FETCH s.base LEFT JOIN FETCH s.challenge " +
           "WHERE s.team.game.id = :gameId AND s.archived = false")
    List<Submission> findByGameIdWithRelations(@Param("gameId") UUID gameId);

    @Query("SELECT s FROM Submission s LEFT JOIN FETCH s.team LEFT JOIN FETCH s.challenge LEFT JOIN FETCH s.base " +
           "WHERE s.team.id = :teamId AND s.archived = false")
    List<Submission> findByTeamId(@Param("teamId") UUID teamId);

    /**
     * Recent submissions for a team, newest first, bounded by the provided
     * {@link Pageable}. Used by the player snapshot endpoint to hydrate the
     * "submissions" list without pulling unbounded history into memory.
     */
    @Query("SELECT s FROM Submission s LEFT JOIN FETCH s.team LEFT JOIN FETCH s.challenge LEFT JOIN FETCH s.base " +
           "WHERE s.team.id = :teamId AND s.archived = false ORDER BY s.submittedAt DESC")
    List<Submission> findRecentByTeamId(@Param("teamId") UUID teamId, Pageable pageable);

    @Query("SELECT s FROM Submission s LEFT JOIN FETCH s.team LEFT JOIN FETCH s.challenge LEFT JOIN FETCH s.base " +
           "WHERE s.team.game.id = :gameId AND s.status = :status AND s.archived = false")
    List<Submission> findByGameIdAndStatus(@Param("gameId") UUID gameId, @Param("status") SubmissionStatus status);

    @Query("SELECT s.team.id, s.challenge.id, COALESCE(s.points, s.challenge.points), s.submittedAt " +
           "FROM Submission s WHERE s.team.game.id = :gameId " +
           "AND s.status IN (com.prayer.pointfinder.entity.SubmissionStatus.correct, com.prayer.pointfinder.entity.SubmissionStatus.approved) " +
           "AND s.challenge IS NOT NULL " +
           "AND s.archived = false")
    List<Object[]> findScoredSubmissionsByGameId(@Param("gameId") UUID gameId);

    @Query("SELECT COUNT(s) FROM Submission s WHERE s.team.game.id = :gameId AND s.status = :status AND s.archived = false")
    long countByGameIdAndStatus(@Param("gameId") UUID gameId, @Param("status") SubmissionStatus status);

    @Query("SELECT COUNT(s) FROM Submission s WHERE s.team.game.id = :gameId AND s.status IN :statuses AND s.archived = false")
    long countByGameIdAndStatusIn(@Param("gameId") UUID gameId, @Param("statuses") List<SubmissionStatus> statuses);

    @Query("SELECT COUNT(s) FROM Submission s WHERE s.team.game.id = :gameId AND s.archived = false")
    long countByGameId(@Param("gameId") UUID gameId);

    /**
     * Looks up active (non-archived) submissions for the given team, challenge,
     * and base triple. Used by {@code SubmissionService.createSubmission} to
     * de-duplicate auto-resolved submissions when no idempotency key is
     * provided. After a {@code resetProgress}, archived rows must not block a
     * legitimate fresh submission, so the filter is intentional.
     */
    @Query("SELECT s FROM Submission s LEFT JOIN FETCH s.team LEFT JOIN FETCH s.challenge LEFT JOIN FETCH s.base " +
           "WHERE s.team.id = :teamId AND s.challenge.id = :challengeId AND s.base.id = :baseId AND s.archived = false")
    List<Submission> findByTeamIdAndChallengeIdAndBaseId(
            @Param("teamId") UUID teamId,
            @Param("challengeId") UUID challengeId,
            @Param("baseId") UUID baseId);

    /**
     * Active-row count by base. Used by {@code BaseService} to refuse base
     * deletion while live submissions still reference it.
     */
    @Query("SELECT COUNT(s) FROM Submission s WHERE s.base.id = :baseId AND s.archived = false")
    long countByBaseId(@Param("baseId") UUID baseId);

    /**
     * Active-row count by challenge. Used by {@code ChallengeService} to
     * refuse challenge deletion while live submissions still reference it.
     */
    @Query("SELECT COUNT(s) FROM Submission s WHERE s.challenge.id = :challengeId AND s.archived = false")
    long countByChallengeId(@Param("challengeId") UUID challengeId);

    @Query(value = "SELECT COUNT(*) > 0 FROM submissions s " +
           "JOIN teams t ON s.team_id = t.id " +
           "WHERE t.game_id = :gameId AND s.archived = false " +
           "AND (s.file_url IN (:urls) OR (s.file_urls IS NOT NULL AND s.file_urls LIKE :urlPattern))",
           nativeQuery = true)
    boolean existsByGameIdAndFileUrlOrFileUrls(@Param("gameId") UUID gameId,
                                               @Param("urls") List<String> urls,
                                               @Param("urlPattern") String urlPattern);

    @Query(value = "SELECT COUNT(*) > 0 FROM submissions s " +
           "WHERE s.team_id = :teamId AND s.archived = false " +
           "AND (s.file_url IN (:urls) OR (s.file_urls IS NOT NULL AND s.file_urls LIKE :urlPattern))",
           nativeQuery = true)
    boolean existsByTeamIdAndFileUrlOrFileUrls(@Param("teamId") UUID teamId,
                                               @Param("urls") List<String> urls,
                                               @Param("urlPattern") String urlPattern);

    // ── Archive operations (V36) ───────────────────────────────────────

    /**
     * Soft-archives every submission for a game. Replaces the old
     * {@code deleteByGameId} hard-delete in {@code GameService.updateStatus
     * (resetProgress=true)}. The audit trail is preserved; only active
     * queries hide the rows.
     */
    @Modifying
    @Query("UPDATE Submission s SET s.archived = true WHERE s.team.game.id = :gameId AND s.archived = false")
    void markArchivedByGameId(@Param("gameId") UUID gameId);

    /**
     * Hard delete by game id. Retained for tooling and tests; the production
     * reset path uses {@link #markArchivedByGameId(UUID)} instead so that the
     * audit trail is preserved.
     */
    @Modifying
    @Query("DELETE FROM Submission s WHERE s.team.game.id = :gameId")
    void deleteByGameId(@Param("gameId") UUID gameId);

    // ── Audit export reads (Phase 3, anticipated) ──────────────────────
    //
    // The audit export path needs to read EVERYTHING, including archived
    // rows. Adding the variants now means Phase 3 does not need to touch
    // this repository again.

    /**
     * Returns every submission for the game, including archived rows.
     * Reserved for the Phase 3 audit export path.
     */
    @Query("SELECT s FROM Submission s LEFT JOIN FETCH s.team LEFT JOIN FETCH s.challenge LEFT JOIN FETCH s.base " +
           "WHERE s.team.game.id = :gameId ORDER BY s.submittedAt DESC")
    List<Submission> findByGameIdIncludingArchived(@Param("gameId") UUID gameId);
}
