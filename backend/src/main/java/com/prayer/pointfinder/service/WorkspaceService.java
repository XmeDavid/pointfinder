package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.WorkspaceResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.OrgMembershipRepository;
import com.prayer.pointfinder.repository.UserSubscriptionRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class WorkspaceService {

    private final OrgMembershipRepository membershipRepository;
    private final UserSubscriptionRepository userSubRepository;
    private final GameRepository gameRepository;

    @Transactional(readOnly = true)
    public WorkspaceResponse getWorkspaces() {
        User user = SecurityUtils.getCurrentUser();

        UserSubscription sub = userSubRepository.findByUserId(user.getId()).orElse(null);
        String tier = sub != null ? sub.getTier().name() : "free";
        String status = sub != null ? sub.getStatus().name() : "active";
        long personalActiveGames = gameRepository.countByCreatedByIdAndOrganizationIsNullAndStatusIn(
            user.getId(), List.of(GameStatus.setup, GameStatus.live));

        WorkspaceResponse.PersonalWorkspace personal = WorkspaceResponse.PersonalWorkspace.builder()
            .tier(tier)
            .status(status)
            .activeGames((int) personalActiveGames)
            .build();

        List<WorkspaceResponse.OrgWorkspace> orgs = membershipRepository.findByUserId(user.getId()).stream()
            .map(m -> {
                Organization org = m.getOrganization();
                int memberCount = membershipRepository.countByOrganizationId(org.getId());
                long liveGames = gameRepository.countByOrganizationIdAndStatus(org.getId(), GameStatus.live);
                return WorkspaceResponse.OrgWorkspace.builder()
                    .id(org.getId())
                    .name(org.getName())
                    .slug(org.getSlug())
                    .tier(org.getSubscriptionTier().name())
                    .status(org.getSubscriptionStatus().name())
                    .memberCount(memberCount)
                    .liveGames((int) liveGames)
                    .permissions(m.getPermissions())
                    .build();
            }).toList();

        return WorkspaceResponse.builder()
            .personal(personal)
            .organizations(orgs)
            .build();
    }
}
