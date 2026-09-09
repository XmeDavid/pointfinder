package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.InviteStatus;
import com.prayer.pointfinder.entity.OrgInvite;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OrgInviteRepository extends JpaRepository<OrgInvite, UUID> {

    Optional<OrgInvite> findByToken(String token);

    List<OrgInvite> findByOrganizationIdAndStatus(UUID orgId, InviteStatus status);

    List<OrgInvite> findByEmailIgnoreCaseAndStatus(String email, InviteStatus status);

    /** The sweeper's input: pending invites whose deadline has passed. */
    List<OrgInvite> findByStatusAndExpiresAtNotNullAndExpiresAtBefore(InviteStatus status, Instant before);

    boolean existsByOrganizationIdAndEmailIgnoreCaseAndStatus(UUID orgId, String email, InviteStatus status);
}
