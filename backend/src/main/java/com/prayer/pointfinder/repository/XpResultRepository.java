package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.XpResult;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface XpResultRepository extends JpaRepository<XpResult, UUID> {
    List<XpResult> findByCycleId(UUID cycleId);
    Optional<XpResult> findByCycleIdAndTeamId(UUID cycleId, UUID teamId);
}
