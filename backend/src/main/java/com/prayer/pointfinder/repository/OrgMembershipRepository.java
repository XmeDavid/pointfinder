package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.OrgMembership;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OrgMembershipRepository extends JpaRepository<OrgMembership, UUID> {

    List<OrgMembership> findByOrganizationId(UUID orgId);

    List<OrgMembership> findByUserId(UUID userId);

    Optional<OrgMembership> findByOrganizationIdAndUserId(UUID orgId, UUID userId);

    boolean existsByOrganizationIdAndUserId(UUID orgId, UUID userId);

    int countByOrganizationId(UUID orgId);

    void deleteByOrganizationIdAndUserId(UUID orgId, UUID userId);
}
