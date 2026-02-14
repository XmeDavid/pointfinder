package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.Assignment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AssignmentRepository extends JpaRepository<Assignment, UUID> {

    List<Assignment> findByGameId(UUID gameId);

    List<Assignment> findByBaseId(UUID baseId);

    boolean existsByGameIdAndBaseIdAndTeamId(UUID gameId, UUID baseId, UUID teamId);

    boolean existsByGameIdAndBaseIdAndTeamIdIsNull(UUID gameId, UUID baseId);

    boolean existsByGameIdAndBaseIdAndTeamIdIsNotNull(UUID gameId, UUID baseId);

    Optional<Assignment> findByIdAndGameId(UUID id, UUID gameId);

    void deleteByGameId(UUID gameId);
}
