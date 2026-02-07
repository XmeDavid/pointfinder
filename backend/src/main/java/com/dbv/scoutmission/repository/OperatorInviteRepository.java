package com.dbv.scoutmission.repository;

import com.dbv.scoutmission.entity.OperatorInvite;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OperatorInviteRepository extends JpaRepository<OperatorInvite, UUID> {

    Optional<OperatorInvite> findByToken(String token);

    List<OperatorInvite> findByGameId(UUID gameId);

    List<OperatorInvite> findByGameIdIsNull();
}
