package com.dbv.scoutmission.repository;

import com.dbv.scoutmission.entity.Assignment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AssignmentRepository extends JpaRepository<Assignment, UUID> {

    List<Assignment> findByGameId(UUID gameId);

    List<Assignment> findByBaseId(UUID baseId);

    void deleteByGameId(UUID gameId);
}
