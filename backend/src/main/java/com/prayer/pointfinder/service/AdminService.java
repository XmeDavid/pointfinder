package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.*;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AdminService {

    private final UserRepository userRepository;
    private final UserSubscriptionRepository userSubscriptionRepository;
    private final OrganizationRepository organizationRepository;
    private final OrgMembershipRepository orgMembershipRepository;
    private final GameRepository gameRepository;
    private final ResourceRepository resourceRepository;

    @Transactional(readOnly = true)
    public Page<AdminUserResponse> listUsers(String search, int page, int size) {
        PageRequest pageable = PageRequest.of(page, size);
        Page<User> users = search == null || search.isBlank()
                ? userRepository.findAll(pageable)
                : userRepository.searchByNameOrEmail(search, pageable);

        return users.map(u -> {
            UserSubscription sub = userSubscriptionRepository.findByUserId(u.getId()).orElse(null);
            return AdminUserResponse.builder()
                    .id(u.getId())
                    .name(u.getName())
                    .email(u.getEmail())
                    .role(u.getRole().name())
                    .subscriptionTier(sub != null ? sub.getTier().name() : IndividualTier.free.name())
                    .subscriptionStatus(sub != null ? sub.getStatus().name() : SubscriptionStatus.active.name())
                    .createdAt(u.getCreatedAt())
                    .build();
        });
    }

    @Transactional(readOnly = true)
    public AdminUserDetailResponse getUserDetail(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        UserSubscription sub = userSubscriptionRepository.findByUserId(userId).orElse(null);

        int gameCount = gameRepository.findByOperatorOrCreator(userId).size();
        int orgCount = orgMembershipRepository.findByUserId(userId).size();
        long storageBytes = resourceRepository.sumSizeBytesByCreatedByIdAndOrganizationIsNull(userId);

        return AdminUserDetailResponse.builder()
                .id(user.getId())
                .name(user.getName())
                .email(user.getEmail())
                .role(user.getRole().name())
                .subscriptionTier(sub != null ? sub.getTier().name() : IndividualTier.free.name())
                .subscriptionStatus(sub != null ? sub.getStatus().name() : SubscriptionStatus.active.name())
                .billingCycle(sub != null && sub.getBillingCycle() != null ? sub.getBillingCycle().name() : null)
                .currentPeriodEnd(sub != null ? sub.getCurrentPeriodEnd() : null)
                .gracePeriodEnd(sub != null ? sub.getGracePeriodEnd() : null)
                .quotaOverrides(sub != null ? sub.getQuotaOverrides() : null)
                .adminNote(sub != null ? sub.getAdminNote() : null)
                .gameCount(gameCount)
                .orgCount(orgCount)
                .resourceStorageBytes(storageBytes)
                .createdAt(user.getCreatedAt())
                .build();
    }

    @Transactional(readOnly = true)
    public Page<AdminOrgResponse> listOrgs(String search, int page, int size) {
        PageRequest pageable = PageRequest.of(page, size);
        Page<Organization> orgs = search == null || search.isBlank()
                ? organizationRepository.findAll(pageable)
                : organizationRepository.searchByName(search, pageable);

        return orgs.map(o -> AdminOrgResponse.builder()
                .id(o.getId())
                .name(o.getName())
                .slug(o.getSlug())
                .subscriptionTier(o.getSubscriptionTier().name())
                .subscriptionStatus(o.getSubscriptionStatus().name())
                .memberCount(orgMembershipRepository.countByOrganizationId(o.getId()))
                .createdAt(o.getCreatedAt())
                .build());
    }

    @Transactional(readOnly = true)
    public AdminOrgDetailResponse getOrgDetail(UUID orgId) {
        Organization org = organizationRepository.findById(orgId)
                .orElseThrow(() -> new ResourceNotFoundException("Organization", orgId));

        List<OrgMembership> memberships = orgMembershipRepository.findByOrganizationId(orgId);
        List<OrgMemberResponse> memberResponses = memberships.stream()
                .map(m -> OrgMemberResponse.builder()
                        .id(m.getId())
                        .userId(m.getUser().getId())
                        .name(m.getUser().getName())
                        .email(m.getUser().getEmail())
                        .permissions(m.getPermissions())
                        .joinedAt(m.getJoinedAt())
                        .build())
                .toList();

        long gameCount = gameRepository.countByOrganizationIdAndStatusIn(
                orgId,
                List.of(GameStatus.setup, GameStatus.live, GameStatus.ended));
        long storageBytes = resourceRepository.sumSizeBytesByOrganizationId(orgId);

        return AdminOrgDetailResponse.builder()
                .id(org.getId())
                .name(org.getName())
                .slug(org.getSlug())
                .createdBy(org.getCreatedBy().getId())
                .createdByName(org.getCreatedBy().getName())
                .subscriptionTier(org.getSubscriptionTier().name())
                .subscriptionStatus(org.getSubscriptionStatus().name())
                .stripeCustomerId(org.getStripeCustomerId())
                .gracePeriodEnd(org.getGracePeriodEnd())
                .quotaOverrides(org.getQuotaOverrides())
                .adminNote(org.getAdminNote())
                .memberCount(memberships.size())
                .gameCount((int) gameCount)
                .resourceStorageBytes(storageBytes)
                .members(memberResponses)
                .createdAt(org.getCreatedAt())
                .build();
    }

    @Transactional(readOnly = true)
    public List<GameResponse> getUserGames(UUID userId) {
        return gameRepository.findByOperatorOrCreator(userId).stream()
                .map(g -> GameResponse.builder()
                        .id(g.getId())
                        .name(g.getName())
                        .description(g.getDescription())
                        .startDate(g.getStartDate())
                        .endDate(g.getEndDate())
                        .status(g.getStatus().name())
                        .createdBy(g.getCreatedBy() != null ? g.getCreatedBy().getId() : null)
                        .operatorIds(g.getOperators() != null
                                ? g.getOperators().stream().map(User::getId).toList()
                                : List.of())
                        .uniformAssignment(g.getUniformAssignment())
                        .broadcastEnabled(g.getBroadcastEnabled())
                        .broadcastCode(g.getBroadcastCode())
                        .tileSource(g.getTileSource())
                        .unlockTrigger(g.getUnlockTrigger() != null ? g.getUnlockTrigger().name() : null)
                        .orgId(g.getOrganization() != null ? g.getOrganization().getId() : null)
                        .orgName(g.getOrganization() != null ? g.getOrganization().getName() : null)
                        .build())
                .toList();
    }

    @Transactional(readOnly = true)
    public List<GameResponse> getOrgGames(UUID orgId) {
        organizationRepository.findById(orgId)
                .orElseThrow(() -> new ResourceNotFoundException("Organization", orgId));

        // Use the org-id-based queries on GameRepository
        List<Game> games = gameRepository.findByOrganizationIdIn(List.of(orgId));
        return games.stream()
                .map(g -> GameResponse.builder()
                        .id(g.getId())
                        .name(g.getName())
                        .description(g.getDescription())
                        .startDate(g.getStartDate())
                        .endDate(g.getEndDate())
                        .status(g.getStatus().name())
                        .createdBy(g.getCreatedBy() != null ? g.getCreatedBy().getId() : null)
                        .operatorIds(g.getOperators() != null
                                ? g.getOperators().stream().map(User::getId).toList()
                                : List.of())
                        .uniformAssignment(g.getUniformAssignment())
                        .broadcastEnabled(g.getBroadcastEnabled())
                        .broadcastCode(g.getBroadcastCode())
                        .tileSource(g.getTileSource())
                        .unlockTrigger(g.getUnlockTrigger() != null ? g.getUnlockTrigger().name() : null)
                        .orgId(g.getOrganization() != null ? g.getOrganization().getId() : null)
                        .orgName(g.getOrganization() != null ? g.getOrganization().getName() : null)
                        .build())
                .toList();
    }
}
