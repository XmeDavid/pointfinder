package com.dbvnfc.repository;

import com.dbvnfc.model.entity.Operator;
import com.dbvnfc.model.enums.OperatorStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface OperatorRepository extends JpaRepository<Operator, UUID> {

    Optional<Operator> findByEmail(String email);

    Page<Operator> findByStatus(OperatorStatus status, Pageable pageable);

    boolean existsByEmail(String email);
}
