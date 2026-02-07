package com.dbv.scoutmission.repository;

import com.dbv.scoutmission.entity.GameNotification;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface GameNotificationRepository extends JpaRepository<GameNotification, UUID> {

    List<GameNotification> findByGameIdOrderBySentAtDesc(UUID gameId);
}
