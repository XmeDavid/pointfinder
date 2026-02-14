package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.GameNotification;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface GameNotificationRepository extends JpaRepository<GameNotification, UUID> {

    List<GameNotification> findByGameIdOrderBySentAtDesc(UUID gameId);
}
