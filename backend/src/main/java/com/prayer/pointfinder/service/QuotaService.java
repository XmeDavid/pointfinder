package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.QuotaResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.exception.ForbiddenException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.OrgMembershipRepository;
import com.prayer.pointfinder.repository.OrganizationRepository;
import com.prayer.pointfinder.repository.ResourceRepository;
import com.prayer.pointfinder.repository.UserSubscriptionRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@Slf4j
@RequiredArgsConstructor
public class QuotaService {

    private final UserSubscriptionRepository userSubRepository;
    private final OrganizationRepository orgRepository;
    private final OrgMembershipRepository membershipRepository;
    private final GameRepository gameRepository;
    private final ResourceRepository resourceRepository;

    @Value("${app.quota.enforcement-enabled:false}")
    private boolean enforcementEnabled;

    private static final long MB = 1024L * 1024L;
    private static final long GB = 1024L * MB;

    // --- Quota Resolution ---

    @Transactional(readOnly = true)
    public QuotaResponse getPersonalQuota() {
        User user = SecurityUtils.getCurrentUser();
        UserSubscription sub = userSubRepository.findByUserId(user.getId())
            .orElse(UserSubscription.builder().tier(IndividualTier.free).status(SubscriptionStatus.active).build());

        QuotaResponse.Limits limits = resolvePersonalLimits(sub);
        long activeGames = gameRepository.countByCreatedByIdAndOrganizationIsNullAndStatusIn(
            user.getId(), List.of(GameStatus.setup, GameStatus.live));
        long currentResourceBytes = resourceRepository.sumSizeBytesByCreatedByIdAndOrganizationIsNull(user.getId());

        return QuotaResponse.builder()
            .context("personal")
            .tier(sub.getTier().name())
            .limits(limits)
            .usage(QuotaResponse.Usage.builder()
                .currentActiveGames((int) activeGames)
                .currentResourceStorageBytes(currentResourceBytes)
                .build())
            .overrides(sub.getQuotaOverrides())
            .build();
    }

    @Transactional(readOnly = true)
    public QuotaResponse getOrgQuota(UUID orgId) {
        User user = SecurityUtils.getCurrentUser();
        Organization org = orgRepository.findById(orgId)
            .orElseThrow(() -> new ResourceNotFoundException("Organization", orgId));

        if (user.getRole() != UserRole.admin) {
            if (!membershipRepository.existsByOrganizationIdAndUserId(orgId, user.getId())) {
                throw new ForbiddenException("You are not a member of this organization");
            }
        }

        QuotaResponse.Limits limits = resolveOrgLimits(org);
        int memberCount = membershipRepository.countByOrganizationId(orgId);
        long liveGames = gameRepository.countByOrganizationIdAndStatus(orgId, GameStatus.live);
        long currentResourceBytes = resourceRepository.sumSizeBytesByOrganizationId(orgId);

        return QuotaResponse.builder()
            .context("org")
            .orgId(orgId)
            .tier(org.getSubscriptionTier().name())
            .limits(limits)
            .usage(QuotaResponse.Usage.builder()
                .currentActiveGames((int) (gameRepository.countByOrganizationIdAndStatusIn(
                    orgId, List.of(GameStatus.setup, GameStatus.live))))
                .currentMembers(memberCount)
                .currentLiveGames((int) liveGames)
                .currentResourceStorageBytes(currentResourceBytes)
                .build())
            .overrides(org.getQuotaOverrides())
            .build();
    }

    // --- Enforcement ---

    public void enforceActiveGameLimit(User user) {
        if (!enforcementEnabled) return;
        UserSubscription sub = userSubRepository.findByUserId(user.getId()).orElse(null);
        if (sub == null || sub.getTier() == IndividualTier.pro) return;

        Integer max = getOverride(sub.getQuotaOverrides(), "max_active_games", 1);
        if (max == null) return;

        long current = gameRepository.countByCreatedByIdAndOrganizationIsNullAndStatusIn(
            user.getId(), List.of(GameStatus.setup, GameStatus.live));
        if (current >= max) {
            throw new BadRequestException("Active game limit reached (" + max + ")", ErrorCode.QUOTA_ACTIVE_GAMES_EXCEEDED);
        }
    }

    public void enforceOrgLiveGameLimit(Organization org) {
        if (!enforcementEnabled) return;
        Integer max = resolveOrgLimits(org).getMaxLiveGames();
        if (max == null) return;

        long current = gameRepository.countByOrganizationIdAndStatus(org.getId(), GameStatus.live);
        if (current >= max) {
            throw new BadRequestException("Live game limit reached (" + max + ")", ErrorCode.QUOTA_LIVE_GAMES_EXCEEDED);
        }
    }

    public void enforceBasesPerGameLimit(Game game) {
        if (!enforcementEnabled) return;
        Integer max;
        if (game.getOrganization() != null) {
            max = resolveOrgLimits(game.getOrganization()).getMaxBasesPerGame();
        } else {
            UserSubscription sub = userSubRepository.findByUserId(game.getCreatedBy().getId()).orElse(null);
            max = resolvePersonalLimits(sub).getMaxBasesPerGame();
        }
        if (max == null) return;

        long current = gameRepository.countBasesByGameId(game.getId());
        if (current >= max) {
            throw new BadRequestException("Base limit reached (" + max + ")", ErrorCode.QUOTA_BASES_PER_GAME_EXCEEDED);
        }
    }

    public void enforceOperatorsPerGameLimit(Game game) {
        if (!enforcementEnabled) return;
        Integer max;
        if (game.getOrganization() != null) {
            max = resolveOrgLimits(game.getOrganization()).getMaxOperatorsPerGame();
        } else {
            UserSubscription sub = userSubRepository.findByUserId(game.getCreatedBy().getId()).orElse(null);
            max = resolvePersonalLimits(sub).getMaxOperatorsPerGame();
        }
        if (max == null) return;

        long current = gameRepository.countOperatorsByGameId(game.getId());
        if (current >= max) {
            throw new BadRequestException("Operator limit reached (" + max + ")", ErrorCode.QUOTA_OPERATORS_PER_GAME_EXCEEDED);
        }
    }

    public int getMaxMembers(Organization org) {
        QuotaResponse.Limits limits = resolveOrgLimits(org);
        return limits.getMaxMembers() != null ? limits.getMaxMembers() : Integer.MAX_VALUE;
    }

    public long getMaxFileSizeBytes(Game game) {
        if (game.getOrganization() != null) {
            return resolveOrgLimits(game.getOrganization()).getMaxFileSizeBytes();
        }
        UserSubscription sub = userSubRepository.findByUserId(game.getCreatedBy().getId()).orElse(null);
        return resolvePersonalLimits(sub).getMaxFileSizeBytes();
    }

    public long getMaxResourceStorageBytes(Organization org) {
        Map<String, Object> overrides = org.getQuotaOverrides();
        Long override = getOverrideLong(overrides, "max_resource_storage_bytes", null);
        if (override != null) return override;
        return switch (org.getSubscriptionTier()) {
            case high -> 25 * GB;
            case base, free -> 5 * GB;
        };
    }

    public long getMaxPersonalResourceStorageBytes(User user) {
        UserSubscription sub = userSubRepository.findByUserId(user.getId()).orElse(null);
        if (sub == null || sub.getTier() == IndividualTier.free) return 0;
        Long override = getOverrideLong(sub.getQuotaOverrides(), "max_resource_storage_bytes", null);
        if (override != null) return override;
        return GB; // pro = 1GB
    }

    // --- Limit Resolution ---

    private QuotaResponse.Limits resolvePersonalLimits(UserSubscription sub) {
        if (sub == null || sub.getTier() == IndividualTier.free) {
            return QuotaResponse.Limits.builder()
                .maxActiveGames(getOverride(sub != null ? sub.getQuotaOverrides() : null, "max_active_games", 1))
                .maxOperatorsPerGame(getOverride(sub != null ? sub.getQuotaOverrides() : null, "max_operators_per_game", 1))
                .maxBasesPerGame(getOverride(sub != null ? sub.getQuotaOverrides() : null, "max_bases_per_game", 25))
                .maxFileSizeBytes(getOverrideLong(sub != null ? sub.getQuotaOverrides() : null, "max_file_size_bytes", 100 * MB))
                .maxResourceStorageBytes(getOverrideLong(sub != null ? sub.getQuotaOverrides() : null, "max_resource_storage_bytes", 0L))
                .build();
        }
        // Pro
        return QuotaResponse.Limits.builder()
            .maxActiveGames(getOverride(sub.getQuotaOverrides(), "max_active_games", null))
            .maxOperatorsPerGame(getOverride(sub.getQuotaOverrides(), "max_operators_per_game", 5))
            .maxBasesPerGame(getOverride(sub.getQuotaOverrides(), "max_bases_per_game", null))
            .maxFileSizeBytes(getOverrideLong(sub.getQuotaOverrides(), "max_file_size_bytes", 2 * GB))
            .maxResourceStorageBytes(getOverrideLong(sub.getQuotaOverrides(), "max_resource_storage_bytes", GB))
            .build();
    }

    private QuotaResponse.Limits resolveOrgLimits(Organization org) {
        Map<String, Object> overrides = org.getQuotaOverrides();
        if (org.getSubscriptionTier() == OrgTier.high) {
            return QuotaResponse.Limits.builder()
                .maxMembers(getOverride(overrides, "max_members", 15))
                .maxLiveGames(getOverride(overrides, "max_live_games", null))
                .maxOperatorsPerGame(getOverride(overrides, "max_operators_per_game", null))
                .maxBasesPerGame(getOverride(overrides, "max_bases_per_game", null))
                .maxFileSizeBytes(getOverrideLong(overrides, "max_file_size_bytes", 2 * GB))
                .maxResourceStorageBytes(getOverrideLong(overrides, "max_resource_storage_bytes", 25 * GB))
                .build();
        }
        // Base (or free — same limits as base but admin-granted)
        return QuotaResponse.Limits.builder()
            .maxMembers(getOverride(overrides, "max_members", 3))
            .maxLiveGames(getOverride(overrides, "max_live_games", 10))
            .maxOperatorsPerGame(getOverride(overrides, "max_operators_per_game", null))
            .maxBasesPerGame(getOverride(overrides, "max_bases_per_game", null))
            .maxFileSizeBytes(getOverrideLong(overrides, "max_file_size_bytes", 2 * GB))
            .maxResourceStorageBytes(getOverrideLong(overrides, "max_resource_storage_bytes", 5 * GB))
            .build();
    }

    private Integer getOverride(Map<String, Object> overrides, String key, Integer defaultValue) {
        if (overrides != null && overrides.containsKey(key)) {
            Object val = overrides.get(key);
            if (val == null) return null;
            return ((Number) val).intValue();
        }
        return defaultValue;
    }

    private Long getOverrideLong(Map<String, Object> overrides, String key, Long defaultValue) {
        if (overrides != null && overrides.containsKey(key)) {
            Object val = overrides.get(key);
            if (val == null) return null;
            return ((Number) val).longValue();
        }
        return defaultValue;
    }
}
