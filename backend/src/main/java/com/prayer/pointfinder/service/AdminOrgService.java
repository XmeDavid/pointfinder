package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateAdminOrgRequest;
import com.prayer.pointfinder.dto.request.UpdateAdminOrgRequest;
import com.prayer.pointfinder.dto.response.AdminCreateOrgResponse;
import com.prayer.pointfinder.dto.response.OrgResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.OrgMembershipRepository;
import com.prayer.pointfinder.repository.OrganizationRepository;
import com.prayer.pointfinder.repository.UserRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

/**
 * The sales side of clubs: an admin creates the org, adjusts its deal, and
 * hands ownership over. Everything here is behind {@code /api/admin/**}, which
 * SecurityConfig restricts to the ADMIN role.
 *
 * <p>Enum-valued fields are parsed here rather than with {@code valueOf} at the
 * controller, so a bad tier or status answers 400 with
 * {@code ORG_INVALID_ENUM_VALUE} instead of falling through to the generic
 * 500 handler.
 *
 * <p>No admin audit table exists in this schema — the V36 audit foundation
 * covers game actions, not platform administration — so each change writes an
 * {@code [ADMIN]} log line naming the acting admin and the target org.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class AdminOrgService {

    private final OrganizationRepository orgRepository;
    private final OrgMembershipRepository membershipRepository;
    private final UserRepository userRepository;
    private final OrganizationService organizationService;
    private final OrgInviteService orgInviteService;

    @Transactional
    public AdminCreateOrgResponse createOrg(CreateAdminOrgRequest request, String requestHost) {
        User admin = currentAdmin();
        String email = request.getAdminEmail() != null ? request.getAdminEmail().trim() : "";
        if (email.isEmpty()) {
            throw new BadRequestException("adminEmail is required", ErrorCode.ORG_ADMIN_EMAIL_INVALID);
        }

        Optional<User> existing = userRepository.findByEmail(email);

        // Until the invitee registers, the creating admin owns the org: the
        // created_by column is NOT NULL and an org with no owner cannot be
        // administered. Accepting the invite moves ownership across.
        User owner = existing.orElse(admin);

        Organization org = Organization.builder()
            .name(request.getName())
            .slug(organizationService.generateUniqueSlug(request.getName()))
            .createdBy(owner)
            .subscriptionTier(OrgTier.club)
            .subscriptionStatus(SubscriptionStatus.active)
            .quotaOverrides(request.getQuotaOverrides())
            .termEnd(request.getTermEnd())
            .adminNote(request.getAdminNote())
            .build();
        org = orgRepository.save(org);

        UUID adminUserId = null;
        UUID inviteId = null;

        if (existing.isPresent()) {
            membershipRepository.save(OrgMembership.builder()
                .organization(org)
                .user(existing.get())
                .permissions(OrgPermission.ALL)
                .build());
            adminUserId = existing.get().getId();
        } else {
            inviteId = orgInviteService.createOwnerInvite(org, email, admin, requestHost).getId();
        }

        log.info("[ADMIN] operation=createClub actor={} orgId={} name={} adminEmail={} "
                + "existingUser={} termEnd={} overrides={}",
            admin.getId(), org.getId(), org.getName(), email,
            existing.isPresent(), org.getTermEnd(), org.getQuotaOverrides());

        return new AdminCreateOrgResponse(
            organizationService.toResponse(org), email, adminUserId, inviteId);
    }

    @Transactional
    public OrgResponse updateOrg(UUID orgId, UpdateAdminOrgRequest request) {
        User admin = currentAdmin();
        Organization org = orgRepository.findById(orgId)
            .orElseThrow(() -> new ResourceNotFoundException("Organization", orgId));

        if (request.getName() != null) org.setName(request.getName());
        if (request.getTier() != null) org.setSubscriptionTier(parseTier(request.getTier()));
        if (request.getStatus() != null) org.setSubscriptionStatus(parseStatus(request.getStatus()));
        if (request.getQuotaOverrides() != null) org.setQuotaOverrides(request.getQuotaOverrides());
        if (request.getTermEnd() != null) org.setTermEnd(request.getTermEnd());
        if (request.getGracePeriodEnd() != null) org.setGracePeriodEnd(request.getGracePeriodEnd());
        if (request.getAdminNote() != null) org.setAdminNote(request.getAdminNote());

        org = orgRepository.save(org);

        log.info("[ADMIN] operation=updateClub actor={} orgId={} tier={} status={} termEnd={} overrides={}",
            admin.getId(), orgId, org.getSubscriptionTier(), org.getSubscriptionStatus(),
            org.getTermEnd(), org.getQuotaOverrides());

        return organizationService.toResponse(org);
    }

    /**
     * Moves ownership to an existing member and grants them every permission.
     * The target must already be a member: an org's owner is by definition
     * someone inside it, and silently adding them would hide a mistyped id.
     */
    @Transactional
    public OrgResponse transferOwnership(UUID orgId, UUID newOwnerId) {
        User admin = currentAdmin();
        Organization org = orgRepository.findById(orgId)
            .orElseThrow(() -> new ResourceNotFoundException("Organization", orgId));

        log.info("[ADMIN] operation=transferOwnership actor={} orgId={} newOwner={}",
            admin.getId(), orgId, newOwnerId);

        return organizationService.applyOwnershipTransfer(org, newOwnerId, admin);
    }

    private OrgTier parseTier(String raw) {
        try {
            return OrgTier.valueOf(raw);
        } catch (IllegalArgumentException ex) {
            throw new BadRequestException(
                "Unknown tier '" + raw + "'. Expected one of: free, club.",
                ErrorCode.ORG_INVALID_ENUM_VALUE);
        }
    }

    private SubscriptionStatus parseStatus(String raw) {
        try {
            return SubscriptionStatus.valueOf(raw);
        } catch (IllegalArgumentException ex) {
            throw new BadRequestException(
                "Unknown status '" + raw + "'. Expected one of: active, past_due, grace_period, frozen, cancelled.",
                ErrorCode.ORG_INVALID_ENUM_VALUE);
        }
    }

    /** Reloads the acting admin so the org's created_by FK points at a managed entity. */
    private User currentAdmin() {
        UUID id = SecurityUtils.getCurrentUser().getId();
        return userRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("User", id));
    }
}
