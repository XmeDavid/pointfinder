package com.dbvnfc.repository;

import com.dbvnfc.model.entity.OperatorInvite;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface OperatorInviteRepository extends JpaRepository<OperatorInvite, UUID> {

    Optional<OperatorInvite> findByToken(String token);
}
