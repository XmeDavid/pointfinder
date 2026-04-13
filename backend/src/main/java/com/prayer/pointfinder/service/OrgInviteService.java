package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.OrgInviteResponse;
import com.prayer.pointfinder.dto.response.OrgMemberResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.*;
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
public class OrgInviteService {

    private final OrgInviteRepository orgInviteRepository;
    private final OrgMembershipRepository membershipRepository;
    private final OrganizationRepository orgRepository;
    private final UserRepository userRepository;
    private final OrganizationService organizationService;
    private final QuotaService quotaService;
    private final EmailService emailService;

    @Transactional(timeout = 10)
    public OrgInviteResponse createInvite(UUID orgId, String email, String requestHost) {
        User currentUser = SecurityUtils.getCurrentUser();
        organizationService.ensureCurrentUserHasPermission(orgId, OrgPermission.INVITE_MEMBERS);

        Organization org = orgRepository.findById(orgId)
                .orElseThrow(() -> new ResourceNotFoundException("Organization", orgId));

        // Check member quota (pending invites don't count, only existing members)
        int currentCount = membershipRepository.countByOrganizationId(orgId);
        int maxMembers = quotaService.getMaxMembers(org);
        if (maxMembers > 0 && currentCount >= maxMembers) {
            throw new BadRequestException("Organization has reached its member limit (" + maxMembers + ")");
        }

        // Check if email is already a member
        userRepository.findByEmail(email).ifPresent(existingUser -> {
            if (membershipRepository.existsByOrganizationIdAndUserId(orgId, existingUser.getId())) {
                throw new BadRequestException("This user is already a member of the organization");
            }
        });

        // Check for existing pending invite
        if (orgInviteRepository.existsByOrganizationIdAndEmailAndStatus(orgId, email, InviteStatus.pending)) {
            throw new BadRequestException("A pending invite already exists for this email");
        }

        // Reload current user to avoid detached entity issues
        UUID inviterId = currentUser.getId();
        User inviter = userRepository.findById(inviterId)
                .orElseThrow(() -> new ResourceNotFoundException("User", inviterId));

        OrgInvite invite = OrgInvite.builder()
                .organization(org)
                .email(email)
                .token(UUID.randomUUID().toString())
                .status(InviteStatus.pending)
                .defaultPermissions(OrgPermission.OPERATE_GAMES.getBit())
                .invitedBy(inviter)
                .build();

        invite = orgInviteRepository.saveAndFlush(invite);

        // Send appropriate email based on whether user exists
        boolean userExists = userRepository.findByEmail(email).isPresent();
        if (userExists) {
            emailService.sendOrgInvite(email, org.getName(), inviter.getName(), requestHost);
        } else {
            emailService.sendOrgRegistrationInvite(email, invite.getToken(), org.getName(), inviter.getName(), requestHost);
        }

        log.info("[ORG_INVITE] operation=createInvite orgId={} email={} inviter={}", orgId, email, inviterId);

        return toResponse(invite);
    }

    @Transactional(readOnly = true)
    public List<OrgInviteResponse> getOrgInvites(UUID orgId) {
        organizationService.ensureCurrentUserHasPermission(orgId, OrgPermission.INVITE_MEMBERS);
        return orgInviteRepository.findByOrganizationIdAndStatus(orgId, InviteStatus.pending)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<OrgInviteResponse> getMyOrgInvites() {
        User currentUser = SecurityUtils.getCurrentUser();
        return orgInviteRepository.findByEmailAndStatus(currentUser.getEmail(), InviteStatus.pending)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(timeout = 10)
    public OrgMemberResponse acceptInvite(UUID inviteId) {
        UUID userId = SecurityUtils.getCurrentUser().getId();
        User currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        OrgInvite invite = orgInviteRepository.findById(inviteId)
                .orElseThrow(() -> new ResourceNotFoundException("OrgInvite", inviteId));

        if (!invite.getEmail().equalsIgnoreCase(currentUser.getEmail())) {
            throw new BadRequestException("This invitation is not for you.");
        }

        if (invite.getStatus() != InviteStatus.pending) {
            throw new BadRequestException("This invitation has already been processed.");
        }

        Organization org = invite.getOrganization();

        if (membershipRepository.existsByOrganizationIdAndUserId(org.getId(), currentUser.getId())) {
            // Already a member — just mark as accepted
            invite.setStatus(InviteStatus.accepted);
            orgInviteRepository.save(invite);
            throw new BadRequestException("You are already a member of this organization.");
        }

        invite.setStatus(InviteStatus.accepted);
        orgInviteRepository.save(invite);

        OrgMembership membership = OrgMembership.builder()
                .organization(org)
                .user(currentUser)
                .permissions(invite.getDefaultPermissions())
                .build();
        membership = membershipRepository.save(membership);

        log.info("[ORG_INVITE] operation=acceptInvite orgId={} userId={} inviteId={}", org.getId(), userId, inviteId);

        return toMemberResponse(membership, currentUser);
    }

    @Transactional(timeout = 10)
    public OrgMemberResponse acceptInviteByToken(String token, User user) {
        OrgInvite invite = orgInviteRepository.findByToken(token)
                .orElseThrow(() -> new ResourceNotFoundException("Invalid invite token"));

        if (!invite.getEmail().equalsIgnoreCase(user.getEmail())) {
            throw new BadRequestException("This invitation is not for you.");
        }

        if (invite.getStatus() != InviteStatus.pending) {
            throw new BadRequestException("This invitation has already been processed.");
        }

        Organization org = invite.getOrganization();

        if (membershipRepository.existsByOrganizationIdAndUserId(org.getId(), user.getId())) {
            invite.setStatus(InviteStatus.accepted);
            orgInviteRepository.save(invite);
            throw new BadRequestException("You are already a member of this organization.");
        }

        invite.setStatus(InviteStatus.accepted);
        orgInviteRepository.save(invite);

        OrgMembership membership = OrgMembership.builder()
                .organization(org)
                .user(user)
                .permissions(invite.getDefaultPermissions())
                .build();
        membership = membershipRepository.save(membership);

        log.info("[ORG_INVITE] operation=acceptInviteByToken orgId={} userId={}", org.getId(), user.getId());

        return toMemberResponse(membership, user);
    }

    @Transactional(timeout = 10)
    public void revokeInvite(UUID orgId, UUID inviteId) {
        User currentUser = SecurityUtils.getCurrentUser();

        OrgInvite invite = orgInviteRepository.findById(inviteId)
                .orElseThrow(() -> new ResourceNotFoundException("OrgInvite", inviteId));

        if (!invite.getOrganization().getId().equals(orgId)) {
            throw new BadRequestException("Invite does not belong to this organization.");
        }

        if (invite.getStatus() != InviteStatus.pending) {
            throw new BadRequestException("Only pending invites can be revoked.");
        }

        organizationService.ensureCurrentUserHasPermission(orgId, OrgPermission.INVITE_MEMBERS);

        orgInviteRepository.delete(invite);
        log.info("[ORG_INVITE] operation=revokeInvite orgId={} inviteId={} operator={}", orgId, inviteId, currentUser.getId());
    }

    @Transactional(readOnly = true)
    public OrgInviteResponse getInviteByToken(String token) {
        OrgInvite invite = orgInviteRepository.findByToken(token)
                .orElseThrow(() -> new ResourceNotFoundException("Invalid invite token"));
        if (invite.getStatus() != InviteStatus.pending) {
            throw new BadRequestException("Invite has already been used or expired");
        }
        return toResponse(invite);
    }

    private OrgInviteResponse toResponse(OrgInvite invite) {
        return OrgInviteResponse.builder()
                .id(invite.getId())
                .orgId(invite.getOrganization().getId())
                .orgName(invite.getOrganization().getName())
                .email(invite.getEmail())
                .status(invite.getStatus().name())
                .invitedBy(invite.getInvitedBy() != null ? invite.getInvitedBy().getId() : null)
                .inviterName(invite.getInvitedBy() != null ? invite.getInvitedBy().getName() : null)
                .createdAt(invite.getCreatedAt())
                .build();
    }

    private OrgMemberResponse toMemberResponse(OrgMembership membership, User user) {
        return OrgMemberResponse.builder()
                .id(membership.getId())
                .userId(user.getId())
                .name(user.getName())
                .email(user.getEmail())
                .permissions(membership.getPermissions())
                .joinedAt(membership.getJoinedAt())
                .build();
    }
}
