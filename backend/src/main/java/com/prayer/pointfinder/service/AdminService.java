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
            return new AdminUserResponse(
                    u.getId(),
                    u.getName(),
                    u.getEmail(),
                    u.getRole().name(),
                    sub != null ? sub.getTier().name() : IndividualTier.free.name(),
                    sub != null ? sub.getStatus().name() : SubscriptionStatus.active.name(),
                    u.getCreatedAt()
            );
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

        return new AdminUserDetailResponse(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getRole().name(),
                sub != null ? sub.getTier().name() : IndividualTier.free.name(),
                sub != null ? sub.getStatus().name() : SubscriptionStatus.active.name(),
                sub != null && sub.getBillingCycle() != null ? sub.getBillingCycle().name() : null,
                sub != null ? sub.getCurrentPeriodEnd() : null,
                sub != null ? sub.getGracePeriodEnd() : null,
                sub != null ? sub.getQuotaOverrides() : null,
                sub != null ? sub.getAdminNote() : null,
                gameCount,
                orgCount,
                storageBytes,
                user.getCreatedAt()
        );
    }

    @Transactional(readOnly = true)
    public Page<AdminOrgResponse> listOrgs(String search, int page, int size) {
        PageRequest pageable = PageRequest.of(page, size);
        Page<Organization> orgs = search == null || search.isBlank()
                ? organizationRepository.findAll(pageable)
                : organizationRepository.searchByName(search, pageable);

        return orgs.map(o -> new AdminOrgResponse(
                o.getId(),
                o.getName(),
                o.getSlug(),
                o.getSubscriptionTier().name(),
                o.getSubscriptionStatus().name(),
                orgMembershipRepository.countByOrganizationId(o.getId()),
                o.getCreatedAt()
        ));
    }

    @Transactional(readOnly = true)
    public AdminOrgDetailResponse getOrgDetail(UUID orgId) {
        Organization org = organizationRepository.findById(orgId)
                .orElseThrow(() -> new ResourceNotFoundException("Organization", orgId));

        List<OrgMembership> memberships = orgMembershipRepository.findByOrganizationId(orgId);
        List<OrgMemberResponse> memberResponses = memberships.stream()
                .map(m -> new OrgMemberResponse(
                        m.getId(),
                        m.getUser().getId(),
                        m.getUser().getName(),
                        m.getUser().getEmail(),
                        m.getPermissions(),
                        m.getJoinedAt()
                ))
                .toList();

        long gameCount = gameRepository.countByOrganizationIdAndStatusIn(
                orgId,
                List.of(GameStatus.setup, GameStatus.live, GameStatus.ended));
        long storageBytes = resourceRepository.sumSizeBytesByOrganizationId(orgId);

        return new AdminOrgDetailResponse(
                org.getId(),
                org.getName(),
                org.getSlug(),
                org.getCreatedBy().getId(),
                org.getCreatedBy().getName(),
                org.getSubscriptionTier().name(),
                org.getSubscriptionStatus().name(),
                org.getStripeCustomerId(),
                org.getGracePeriodEnd(),
                org.getQuotaOverrides(),
                org.getAdminNote(),
                memberships.size(),
                (int) gameCount,
                storageBytes,
                memberResponses,
                org.getCreatedAt()
        );
    }

    @Transactional(readOnly = true)
    public List<GameResponse> getUserGames(UUID userId) {
        return gameRepository.findByOperatorOrCreator(userId).stream()
                .map(g -> new GameResponse(
                        g.getId(),
                        g.getName(),
                        g.getDescription(),
                        g.getStartDate(),
                        g.getEndDate(),
                        g.getStatus().name(),
                        g.getCreatedBy() != null ? g.getCreatedBy().getId() : null,
                        g.getOperators() != null
                                ? g.getOperators().stream().map(User::getId).toList()
                                : List.of(),
                        g.getUniformAssignment(),
                        g.getBroadcastEnabled(),
                        g.getBroadcastCode(),
                        g.getTileSource(),
                        g.getUnlockTrigger() != null ? g.getUnlockTrigger().name() : null,
                        g.getOrganization() != null ? g.getOrganization().getId() : null,
                        g.getOrganization() != null ? g.getOrganization().getName() : null
                ))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<GameResponse> getOrgGames(UUID orgId) {
        organizationRepository.findById(orgId)
                .orElseThrow(() -> new ResourceNotFoundException("Organization", orgId));

        // Use the org-id-based queries on GameRepository
        List<Game> games = gameRepository.findByOrganizationIdIn(List.of(orgId));
        return games.stream()
                .map(g -> new GameResponse(
                        g.getId(),
                        g.getName(),
                        g.getDescription(),
                        g.getStartDate(),
                        g.getEndDate(),
                        g.getStatus().name(),
                        g.getCreatedBy() != null ? g.getCreatedBy().getId() : null,
                        g.getOperators() != null
                                ? g.getOperators().stream().map(User::getId).toList()
                                : List.of(),
                        g.getUniformAssignment(),
                        g.getBroadcastEnabled(),
                        g.getBroadcastCode(),
                        g.getTileSource(),
                        g.getUnlockTrigger() != null ? g.getUnlockTrigger().name() : null,
                        g.getOrganization() != null ? g.getOrganization().getId() : null,
                        g.getOrganization() != null ? g.getOrganization().getName() : null
                ))
                .toList();
    }
}
