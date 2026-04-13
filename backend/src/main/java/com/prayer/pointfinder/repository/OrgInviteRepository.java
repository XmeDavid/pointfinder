package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.InviteStatus;
import com.prayer.pointfinder.entity.OrgInvite;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OrgInviteRepository extends JpaRepository<OrgInvite, UUID> {

    Optional<OrgInvite> findByToken(String token);

    List<OrgInvite> findByOrganizationIdAndStatus(UUID orgId, InviteStatus status);

    List<OrgInvite> findByEmailAndStatus(String email, InviteStatus status);

    boolean existsByOrganizationIdAndEmailAndStatus(UUID orgId, String email, InviteStatus status);
}
