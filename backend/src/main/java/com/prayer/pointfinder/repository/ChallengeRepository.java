package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.Challenge;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChallengeRepository extends JpaRepository<Challenge, UUID> {

    List<Challenge> findByGameId(UUID gameId);

    List<Challenge> findByGameIdOrderByCreatedAtAsc(UUID gameId);

    long countByGameId(UUID gameId);

    @Query("SELECT c FROM Challenge c WHERE c.game.id = :gameId AND c.unlocksBases IS NOT EMPTY")
    List<Challenge> findByGameIdAndUnlocksBasesNotEmpty(@Param("gameId") UUID gameId);

    @Query("SELECT c FROM Challenge c JOIN c.unlocksBases b WHERE b.id = :baseId")
    Optional<Challenge> findByUnlocksBasesContaining(@Param("baseId") UUID baseId);
}
