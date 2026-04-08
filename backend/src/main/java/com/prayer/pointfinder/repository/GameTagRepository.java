package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.GameTag;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface GameTagRepository extends JpaRepository<GameTag, UUID> {

    List<GameTag> findByGameIdOrderByCreatedAtAsc(UUID gameId);

    Optional<GameTag> findByGameIdAndLabelIgnoreCase(UUID gameId, String label);

    long countByGameId(UUID gameId);
}
