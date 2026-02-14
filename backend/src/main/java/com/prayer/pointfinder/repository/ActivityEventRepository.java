package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.ActivityEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ActivityEventRepository extends JpaRepository<ActivityEvent, UUID> {

    List<ActivityEvent> findByGameIdOrderByTimestampDesc(UUID gameId);

    void deleteByGameId(UUID gameId);
}
