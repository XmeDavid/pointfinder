package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.GamePublication;
import com.prayer.pointfinder.entity.GameStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface GamePublicationRepository extends JpaRepository<GamePublication, UUID> {

    /**
     * Listings Explore may show: published, the game not ended, never a
     * practice game. Text, category and featured filters run in memory over
     * this (small) set so no optional parameter reaches Postgres untyped.
     */
    @Query("""
            SELECT p FROM GamePublication p
              JOIN FETCH p.game g LEFT JOIN FETCH g.organization LEFT JOIN FETCH g.createdBy LEFT JOIN FETCH p.admissionTeam
            WHERE p.publishedAt IS NOT NULL
              AND g.status IN :statuses AND g.tutorialScenario IS NULL
            """)
    List<GamePublication> findListed(@Param("statuses") List<GameStatus> statuses);

    @Query("""
            SELECT p FROM GamePublication p
              JOIN FETCH p.game g LEFT JOIN FETCH g.organization LEFT JOIN FETCH g.createdBy LEFT JOIN FETCH p.admissionTeam
            WHERE p.gameId = :gameId AND p.publishedAt IS NOT NULL
              AND g.status IN :statuses AND g.tutorialScenario IS NULL
            """)
    Optional<GamePublication> findListedByGameId(@Param("gameId") UUID gameId, @Param("statuses") List<GameStatus> statuses);

    @Query("""
            SELECT p FROM GamePublication p
              JOIN FETCH p.game g LEFT JOIN FETCH g.organization LEFT JOIN FETCH g.createdBy LEFT JOIN FETCH p.admissionTeam
            ORDER BY p.updatedAt DESC
            """)
    List<GamePublication> findAllWithGame();
}
