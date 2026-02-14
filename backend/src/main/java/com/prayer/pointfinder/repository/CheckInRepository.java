package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.CheckIn;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CheckInRepository extends JpaRepository<CheckIn, UUID> {

    List<CheckIn> findByTeamId(UUID teamId);

    List<CheckIn> findByGameIdAndTeamId(UUID gameId, UUID teamId);

    Optional<CheckIn> findByTeamIdAndBaseId(UUID teamId, UUID baseId);

    boolean existsByTeamIdAndBaseId(UUID teamId, UUID baseId);

    List<CheckIn> findByGameId(UUID gameId);

    void deleteByGameId(UUID gameId);
}
