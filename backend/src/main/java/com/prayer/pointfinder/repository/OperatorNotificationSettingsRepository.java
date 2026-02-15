package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.OperatorNotificationSettings;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OperatorNotificationSettingsRepository extends JpaRepository<OperatorNotificationSettings, UUID> {

    Optional<OperatorNotificationSettings> findByGameIdAndUserId(UUID gameId, UUID userId);

    List<OperatorNotificationSettings> findByGameIdAndUserIdIn(UUID gameId, Collection<UUID> userIds);
}

