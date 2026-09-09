package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.OrgMemberResponse;
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

import java.util.List;
import java.util.UUID;

@Service
@Slf4j
@RequiredArgsConstructor
public class OrgMembershipService {

    private final OrgMembershipRepository membershipRepository;
    private final OrganizationRepository orgRepository;
    private final OrganizationService organizationService;
    private final UserRepository userRepository;
    private final QuotaService quotaService;

    @Transactional(readOnly = true)
    public List<OrgMemberResponse> getMembers(UUID orgId) {
        organizationService.ensureCurrentUserIsMember(orgId);
        return membershipRepository.findByOrganizationId(orgId).stream()
            .map(this::toResponse)
            .toList();
    }

    @Transactional
    public OrgMemberResponse addMember(UUID orgId, String email) {
        organizationService.ensureCurrentUserHasPermission(orgId, OrgPermission.INVITE_MEMBERS);

        Organization org = orgRepository.findById(orgId)
            .orElseThrow(() -> new ResourceNotFoundException("Organization", orgId));

        quotaService.enforceOrgMemberLimit(org);

        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("User with email " + email + " not found"));

        if (membershipRepository.existsByOrganizationIdAndUserId(orgId, user.getId())) {
            throw new BadRequestException("User is already a member of this organization");
        }

        OrgMembership membership = OrgMembership.builder()
            .organization(org)
            .user(user)
            .permissions(OrgPermission.OPERATE_GAMES.getBit())
            .build();
        membership = membershipRepository.save(membership);

        log.info("[ORG] operation=addMember orgId={} userId={} operator={}",
            orgId, user.getId(), SecurityUtils.getCurrentUser().getId());

        return toResponse(membership);
    }

    @Transactional
    public void removeMember(UUID orgId, UUID userId) {
        User currentUser = SecurityUtils.getCurrentUser();

        boolean isSelfRemoval = currentUser.getId().equals(userId);
        if (!isSelfRemoval) {
            organizationService.ensureCurrentUserHasPermission(orgId, OrgPermission.INVITE_MEMBERS);
        }

        Organization org = orgRepository.findById(orgId)
            .orElseThrow(() -> new ResourceNotFoundException("Organization", orgId));

        if (org.getCreatedBy().getId().equals(userId)) {
            throw new BadRequestException("Cannot remove the organization creator");
        }

        membershipRepository.deleteByOrganizationIdAndUserId(orgId, userId);
        log.info("[ORG] operation=removeMember orgId={} userId={} operator={}", orgId, userId, currentUser.getId());
    }

    /**
     * The member's own way out. {@code DELETE /orgs/{id}/members/{userId}} can
     * already do this for a member removing themselves, but a club member
     * should not have to know their own user id — nor read a route that looks
     * like an administrative removal — to walk away.
     *
     * <p>The creator is refused: {@code organizations.created_by} is NOT NULL
     * and an ownerless org cannot be administered, so they transfer ownership
     * first ({@code POST /orgs/{id}/transfer-ownership}).
     */
    @Transactional
    public void leaveOrg(UUID orgId) {
        User currentUser = SecurityUtils.getCurrentUser();

        Organization org = orgRepository.findById(orgId)
            .orElseThrow(() -> new ResourceNotFoundException("Organization", orgId));

        if (!membershipRepository.existsByOrganizationIdAndUserId(orgId, currentUser.getId())) {
            throw new ResourceNotFoundException("Membership not found");
        }

        if (org.getCreatedBy().getId().equals(currentUser.getId())) {
            throw new BadRequestException(
                "Transfer ownership before leaving the organization",
                ErrorCode.ORG_CREATOR_CANNOT_LEAVE);
        }

        membershipRepository.deleteByOrganizationIdAndUserId(orgId, currentUser.getId());
        log.info("[ORG] operation=leaveOrg orgId={} userId={}", orgId, currentUser.getId());
    }

    @Transactional
    public OrgMemberResponse updatePermissions(UUID orgId, UUID userId, int permissions) {
        organizationService.ensureCurrentUserHasPermission(orgId, OrgPermission.MANAGE_PERMS);

        OrgMembership membership = membershipRepository.findByOrganizationIdAndUserId(orgId, userId)
            .orElseThrow(() -> new ResourceNotFoundException("Membership not found"));

        int finalPerms = permissions | OrgPermission.OPERATE_GAMES.getBit();
        membership.setPermissions(finalPerms);
        membership = membershipRepository.save(membership);

        log.info("[ORG] operation=updatePermissions orgId={} userId={} permissions={}",
            orgId, userId, finalPerms);

        return toResponse(membership);
    }

    private OrgMemberResponse toResponse(OrgMembership membership) {
        User user = membership.getUser();
        return new OrgMemberResponse(
            membership.getId(),
            user.getId(),
            user.getName(),
            user.getEmail(),
            membership.getPermissions(),
            membership.getJoinedAt()
        );
    }
}
