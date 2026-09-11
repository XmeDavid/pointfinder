package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.GamePublicationEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface GamePublicationEventRepository extends JpaRepository<GamePublicationEvent, UUID> {
    List<GamePublicationEvent> findByGameIdOrderByCreatedAtAsc(UUID gameId);
}
