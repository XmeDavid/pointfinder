package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.XpCycle;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface XpCycleRepository extends JpaRepository<XpCycle, UUID> {
    Optional<XpCycle> findFirstByGameIdOrderByNumberDesc(UUID gameId);
    List<XpCycle> findByGameIdOrderByNumberDesc(UUID gameId);
}
