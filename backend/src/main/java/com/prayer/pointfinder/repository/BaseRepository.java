package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.Base;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface BaseRepository extends JpaRepository<Base, UUID> {

    List<Base> findByGameId(UUID gameId);

    long countByGameId(UUID gameId);

    long countByGameIdAndNfcLinkedTrue(UUID gameId);

    List<Base> findByFixedChallengeId(UUID challengeId);
}
