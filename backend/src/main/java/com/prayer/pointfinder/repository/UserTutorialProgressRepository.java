package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.UserTutorialProgress;
import com.prayer.pointfinder.entity.UserTutorialProgressId;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface UserTutorialProgressRepository
        extends JpaRepository<UserTutorialProgress, UserTutorialProgressId> {

    List<UserTutorialProgress> findAllByIdUserId(UUID userId);
}
