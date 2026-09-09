package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.OrgInviteResponse;
import com.prayer.pointfinder.dto.response.OrgMemberResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ForbiddenException;
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
        quotaService.enforceOrgMemberLimit(org);

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

    /**
     * The invite an admin sends when they create a club for an address that
     * has no account yet. It differs from a member invite in two ways: it
     * carries every org permission, and accepting it transfers ownership of
     * the club from the creating admin to the invitee.
     *
     * <p>Unlike {@link #createInvite}, this does not check the caller's org
     * permissions or the member quota — the caller is a platform admin who
     * has just created the org, and the invitee is its first member.
     */
    @Transactional(timeout = 10)
    public OrgInvite createOwnerInvite(Organization org, String email, User admin, String requestHost) {
        OrgInvite invite = OrgInvite.builder()
                .organization(org)
                .email(email)
                .token(UUID.randomUUID().toString())
                .status(InviteStatus.pending)
                .defaultPermissions(OrgPermission.ALL)
                .transferOwnership(true)
                .invitedBy(admin)
                .build();
        invite = orgInviteRepository.saveAndFlush(invite);

        emailService.sendOrgRegistrationInvite(
                email, invite.getToken(), org.getName(), admin.getName(), requestHost);

        log.info("[ORG_INVITE] operation=createOwnerInvite orgId={} email={} admin={}",
                org.getId(), email, admin.getId());
        return invite;
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

    /**
     * The other half of {@link #acceptInvite}: the invitee refuses. The row is
     * marked {@code declined} rather than deleted, so the org still sees what
     * it sent and a later accept of the same invite is refused like any other
     * processed one.
     *
     * <p>Only the addressee may decline, matched on email case-insensitively
     * exactly as accept does. Someone else's invite is a {@code 403}, and an
     * invite id that names nothing is a {@code 404}.
     */
    @Transactional(timeout = 10)
    public void declineInvite(UUID inviteId) {
        User currentUser = SecurityUtils.getCurrentUser();

        OrgInvite invite = orgInviteRepository.findById(inviteId)
                .orElseThrow(() -> new ResourceNotFoundException("OrgInvite", inviteId));

        if (!invite.getEmail().equalsIgnoreCase(currentUser.getEmail())) {
            throw new ForbiddenException("This invitation is not for you.");
        }

        if (invite.getStatus() != InviteStatus.pending) {
            throw new BadRequestException("This invitation has already been processed.");
        }

        invite.setStatus(InviteStatus.declined);
        orgInviteRepository.save(invite);

        log.info("[ORG_INVITE] operation=declineInvite orgId={} userId={} inviteId={}",
                invite.getOrganization().getId(), currentUser.getId(), inviteId);
    }

    /**
     * Accepts an org invite by its raw token. This is the path a brand-new
     * account takes: {@code POST /api/auth/register/{token}} creates the user
     * and then calls this, so the invitee lands inside the org on their very
     * first request instead of having to find a pending invite afterwards.
     *
     * <p>An invite flagged {@code transferOwnership} also makes the invitee the
     * org's creator, handing the club over from the admin who set it up.
     */
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

        if (invite.isTransferOwnership()) {
            org.setCreatedBy(user);
            orgRepository.save(org);
            log.info("[ORG_INVITE] operation=transferOwnershipOnAccept orgId={} newOwner={}",
                    org.getId(), user.getId());
        }

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
        return new OrgInviteResponse(
                invite.getId(),
                invite.getOrganization().getId(),
                invite.getOrganization().getName(),
                invite.getEmail(),
                invite.getStatus().name(),
                invite.getInvitedBy() != null ? invite.getInvitedBy().getId() : null,
                invite.getInvitedBy() != null ? invite.getInvitedBy().getName() : null,
                invite.getCreatedAt()
        );
    }

    private OrgMemberResponse toMemberResponse(OrgMembership membership, User user) {
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
