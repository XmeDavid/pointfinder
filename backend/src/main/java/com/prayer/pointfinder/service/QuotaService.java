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
import com.prayer.pointfinder.repository.PlayerRepository;
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
    private final PlayerRepository playerRepository;

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

        return new QuotaResponse(
            "personal",
            null,
            sub.getTier().name(),
            limits,
            new QuotaResponse.Usage(
                (int) activeGames, null, null, currentResourceBytes),
            sub.getQuotaOverrides());
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

        return new QuotaResponse(
            "org",
            orgId,
            org.getSubscriptionTier().name(),
            limits,
            new QuotaResponse.Usage(
                (int) (gameRepository.countByOrganizationIdAndStatusIn(
                    orgId, List.of(GameStatus.setup, GameStatus.live))),
                memberCount, (int) liveGames, currentResourceBytes),
            org.getQuotaOverrides());
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
        Integer max = resolveOrgLimits(org).maxLiveGames();
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
            max = resolveOrgLimits(game.getOrganization()).maxBasesPerGame();
        } else {
            UserSubscription sub = userSubRepository.findByUserId(game.getCreatedBy().getId()).orElse(null);
            max = resolvePersonalLimits(sub).maxBasesPerGame();
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
            max = resolveOrgLimits(game.getOrganization()).maxOperatorsPerGame();
        } else {
            UserSubscription sub = userSubRepository.findByUserId(game.getCreatedBy().getId()).orElse(null);
            max = resolvePersonalLimits(sub).maxOperatorsPerGame();
        }
        if (max == null) return;

        long current = gameRepository.countOperatorsByGameId(game.getId());
        if (current >= max) {
            throw new BadRequestException("Operator limit reached (" + max + ")", ErrorCode.QUOTA_OPERATORS_PER_GAME_EXCEEDED);
        }
    }

    public void enforcePlayersPerGameLimit(Game game) {
        if (!enforcementEnabled) return;
        Integer max;
        if (game.getOrganization() != null) {
            max = resolveOrgLimits(game.getOrganization()).maxPlayersPerGame();
        } else {
            UserSubscription sub = userSubRepository.findByUserId(game.getCreatedBy().getId()).orElse(null);
            max = resolvePersonalLimits(sub).maxPlayersPerGame();
        }
        if (max == null) return;

        long current = playerRepository.countByGameId(game.getId());
        if (current >= max) {
            throw new BadRequestException("Player limit reached (" + max + ")", ErrorCode.QUOTA_PLAYERS_PER_GAME_EXCEEDED);
        }
    }

    public int getMaxMembers(Organization org) {
        QuotaResponse.Limits limits = resolveOrgLimits(org);
        return limits.maxMembers() != null ? limits.maxMembers() : Integer.MAX_VALUE;
    }

    public long getMaxFileSizeBytes(Game game) {
        if (game.getOrganization() != null) {
            return resolveOrgLimits(game.getOrganization()).maxFileSizeBytes();
        }
        UserSubscription sub = userSubRepository.findByUserId(game.getCreatedBy().getId()).orElse(null);
        return resolvePersonalLimits(sub).maxFileSizeBytes();
    }

    public long getMaxResourceStorageBytes(Organization org) {
        Map<String, Object> overrides = org.getQuotaOverrides();
        Long override = getOverrideLong(overrides, "max_resource_storage_bytes", null);
        if (override != null) return override;
        return switch (org.getSubscriptionTier()) {
            case high -> 25 * GB;
            case base -> 5 * GB;
            case free -> 0;
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
            return new QuotaResponse.Limits(
                getOverride(sub != null ? sub.getQuotaOverrides() : null, "max_active_games", 1),
                getOverride(sub != null ? sub.getQuotaOverrides() : null, "max_operators_per_game", 1),
                getOverride(sub != null ? sub.getQuotaOverrides() : null, "max_bases_per_game", 25),
                getOverrideLong(sub != null ? sub.getQuotaOverrides() : null, "max_file_size_bytes", 100 * MB),
                null, null,
                getOverrideLong(sub != null ? sub.getQuotaOverrides() : null, "max_resource_storage_bytes", 0L),
                getOverride(sub != null ? sub.getQuotaOverrides() : null, "max_players_per_game", 50));
        }
        // Pro
        return new QuotaResponse.Limits(
            getOverride(sub.getQuotaOverrides(), "max_active_games", null),
            getOverride(sub.getQuotaOverrides(), "max_operators_per_game", 5),
            getOverride(sub.getQuotaOverrides(), "max_bases_per_game", null),
            getOverrideLong(sub.getQuotaOverrides(), "max_file_size_bytes", 2 * GB),
            null, null,
            getOverrideLong(sub.getQuotaOverrides(), "max_resource_storage_bytes", GB),
            getOverride(sub.getQuotaOverrides(), "max_players_per_game", null));
    }

    private QuotaResponse.Limits resolveOrgLimits(Organization org) {
        Map<String, Object> overrides = org.getQuotaOverrides();
        if (org.getSubscriptionTier() == OrgTier.high) {
            return new QuotaResponse.Limits(
                null,
                getOverride(overrides, "max_operators_per_game", null),
                getOverride(overrides, "max_bases_per_game", null),
                getOverrideLong(overrides, "max_file_size_bytes", 2 * GB),
                getOverride(overrides, "max_members", 15),
                getOverride(overrides, "max_live_games", null),
                getOverrideLong(overrides, "max_resource_storage_bytes", 25 * GB),
                getOverride(overrides, "max_players_per_game", null));
        }
        if (org.getSubscriptionTier() == OrgTier.base) {
            return new QuotaResponse.Limits(
                null,
                getOverride(overrides, "max_operators_per_game", null),
                getOverride(overrides, "max_bases_per_game", null),
                getOverrideLong(overrides, "max_file_size_bytes", 2 * GB),
                getOverride(overrides, "max_members", 10),
                getOverride(overrides, "max_live_games", 10),
                getOverrideLong(overrides, "max_resource_storage_bytes", 5 * GB),
                getOverride(overrides, "max_players_per_game", 200));
        }
        // Free tier — minimal limits for cancelled/downgraded orgs
        return new QuotaResponse.Limits(
            null,
            getOverride(overrides, "max_operators_per_game", 1),
            getOverride(overrides, "max_bases_per_game", 25),
            getOverrideLong(overrides, "max_file_size_bytes", 100 * MB),
            getOverride(overrides, "max_members", 3),
            getOverride(overrides, "max_live_games", 1),
            getOverrideLong(overrides, "max_resource_storage_bytes", 0L),
            getOverride(overrides, "max_players_per_game", 50));
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
