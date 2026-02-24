package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.Challenge;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChallengeRepository extends JpaRepository<Challenge, UUID> {

    List<Challenge> findByGameId(UUID gameId);

    long countByGameId(UUID gameId);

    List<Challenge> findByGameIdAndUnlocksBaseIsNotNull(UUID gameId);

    Optional<Challenge> findByUnlocksBaseId(UUID unlocksBaseId);
}
