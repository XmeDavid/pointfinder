package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateOrgRequest;
import com.prayer.pointfinder.dto.request.UpdateOrgRequest;
import com.prayer.pointfinder.dto.response.OrgResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.ForbiddenException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.OrgMembershipRepository;
import com.prayer.pointfinder.repository.OrganizationRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
@Slf4j
@RequiredArgsConstructor
public class OrganizationService {

    private final OrganizationRepository orgRepository;
    private final OrgMembershipRepository membershipRepository;
    private final GameRepository gameRepository;

    @Transactional
    public OrgResponse createOrg(CreateOrgRequest request) {
        User currentUser = SecurityUtils.getCurrentUser();
        String slug = generateUniqueSlug(request.getName());

        Organization org = Organization.builder()
            .name(request.getName())
            .slug(slug)
            .createdBy(currentUser)
            .subscriptionTier(OrgTier.free)
            .subscriptionStatus(SubscriptionStatus.active)
            .build();

        org = orgRepository.save(org);

        OrgMembership membership = OrgMembership.builder()
            .organization(org)
            .user(currentUser)
            .permissions(OrgPermission.ALL)
            .build();
        membershipRepository.save(membership);

        log.info("[ORG] operation=createOrg orgId={} name={} creator={}",
            org.getId(), org.getName(), currentUser.getId());

        return toResponse(org);
    }

    @Transactional(readOnly = true)
    public OrgResponse getOrg(UUID orgId) {
        Organization org = findOrgOrThrow(orgId);
        ensureCurrentUserIsMember(orgId);
        return toResponse(org);
    }

    @Transactional(readOnly = true)
    public List<OrgResponse> getMyOrgs() {
        User currentUser = SecurityUtils.getCurrentUser();
        return membershipRepository.findByUserId(currentUser.getId()).stream()
            .map(m -> toResponse(m.getOrganization()))
            .toList();
    }

    @Transactional
    public OrgResponse updateOrg(UUID orgId, UpdateOrgRequest request) {
        Organization org = findOrgOrThrow(orgId);
        ensureCurrentUserHasPermission(orgId, OrgPermission.MANAGE_PERMS);

        if (request.getName() != null) {
            org.setName(request.getName());
        }
        org = orgRepository.save(org);
        return toResponse(org);
    }

    @Transactional
    public void deleteOrg(UUID orgId) {
        Organization org = findOrgOrThrow(orgId);
        User currentUser = SecurityUtils.getCurrentUser();

        boolean isCreator = org.getCreatedBy().getId().equals(currentUser.getId());
        boolean isAdmin = currentUser.getRole() == UserRole.admin;
        if (!isCreator && !isAdmin) {
            throw new ForbiddenException("Only the organization creator can delete it");
        }

        log.info("[ORG] operation=deleteOrg orgId={} operator={}", orgId, currentUser.getId());
        orgRepository.delete(org);
    }

    // --- Helpers used by other services ---

    public Organization findOrgOrThrow(UUID orgId) {
        return orgRepository.findById(orgId)
            .orElseThrow(() -> new ResourceNotFoundException("Organization", orgId));
    }

    public void ensureCurrentUserIsMember(UUID orgId) {
        User currentUser = SecurityUtils.getCurrentUser();
        if (currentUser.getRole() == UserRole.admin) return;
        if (!membershipRepository.existsByOrganizationIdAndUserId(orgId, currentUser.getId())) {
            throw new ForbiddenException("You are not a member of this organization");
        }
    }

    public void ensureCurrentUserHasPermission(UUID orgId, OrgPermission permission) {
        User currentUser = SecurityUtils.getCurrentUser();
        if (currentUser.getRole() == UserRole.admin) return;
        OrgMembership membership = membershipRepository
            .findByOrganizationIdAndUserId(orgId, currentUser.getId())
            .orElseThrow(() -> new ForbiddenException("You are not a member of this organization"));
        if (!membership.hasPermission(permission)) {
            throw new ForbiddenException("You do not have permission: " + permission.name());
        }
    }

    private OrgResponse toResponse(Organization org) {
        int memberCount = membershipRepository.countByOrganizationId(org.getId());
        return OrgResponse.builder()
            .id(org.getId())
            .name(org.getName())
            .slug(org.getSlug())
            .createdBy(org.getCreatedBy().getId())
            .subscriptionTier(org.getSubscriptionTier().name())
            .subscriptionStatus(org.getSubscriptionStatus().name())
            .memberCount(memberCount)
            .quotaOverrides(org.getQuotaOverrides())
            .createdAt(org.getCreatedAt())
            .build();
    }

    private String generateUniqueSlug(String name) {
        String base = Normalizer.normalize(name, Normalizer.Form.NFD)
            .replaceAll("[^\\p{ASCII}]", "")
            .toLowerCase(Locale.ROOT)
            .replaceAll("[^a-z0-9]+", "-")
            .replaceAll("^-|-$", "");

        if (base.isEmpty()) base = "org";

        if (!orgRepository.existsBySlug(base)) {
            return base;
        }
        String candidate = base + "-" + UUID.randomUUID().toString().substring(0, 6);
        while (orgRepository.existsBySlug(candidate)) {
            candidate = base + "-" + UUID.randomUUID().toString().substring(0, 6);
        }
        return candidate;
    }
}
