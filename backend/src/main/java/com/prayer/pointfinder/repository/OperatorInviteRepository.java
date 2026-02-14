package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.InviteStatus;
import com.prayer.pointfinder.entity.OperatorInvite;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OperatorInviteRepository extends JpaRepository<OperatorInvite, UUID> {

    Optional<OperatorInvite> findByToken(String token);

    List<OperatorInvite> findByGameId(UUID gameId);

    List<OperatorInvite> findByGameIdIsNull();

    List<OperatorInvite> findByEmailAndStatusAndGameIdIsNotNull(String email, InviteStatus status);
}
