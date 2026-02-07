package com.dbv.scoutmission.repository;

import com.dbv.scoutmission.entity.Challenge;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ChallengeRepository extends JpaRepository<Challenge, UUID> {

    List<Challenge> findByGameId(UUID gameId);

    long countByGameId(UUID gameId);
}
