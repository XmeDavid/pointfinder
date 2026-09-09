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

    /** Override key: a boolean, so an admin can grant location check-in to a free account. */
    static final String LOCATION_CHECK_IN_KEY = "location_check_in";

    private static final long MB = 1024L * 1024L;
    private static final long GB = 1024L * MB;

    // --- Quota Resolution ---

    @Transactional(readOnly = true)
    public QuotaResponse getPersonalQuota() {
        User user = SecurityUtils.getCurrentUser();
        UserSubscription sub = userSubRepository.findByUserId(user.getId())
            .orElse(UserSubscription.builder().tier(IndividualTier.free).status(SubscriptionStatus.active).build());

        QuotaResponse.Limits limits = resolvePersonalLimits(sub);
        long activeGames = gameRepository.countByCreatedByIdAndOrganizationIsNullAndStatusInAndTutorialScenarioIsNull(
            user.getId(), List.of(GameStatus.setup, GameStatus.live));
        long currentResourceBytes = resourceRepository.sumSizeBytesByCreatedByIdAndOrganizationIsNull(user.getId());

        return new QuotaResponse(
            "personal",
            null,
            sub.getTier().name(),
            limits,
            new QuotaResponse.Usage(
                (int) activeGames, null, null, currentResourceBytes),
            sub.getQuotaOverrides(),
            sub.getStatus().name(),
            null);
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
            org.getQuotaOverrides(),
            org.getSubscriptionStatus().name(),
            org.getTermEnd());
    }

    // --- Enforcement ---

    public void enforceActiveGameLimit(User user) {
        if (!enforcementEnabled) return;
        UserSubscription sub = userSubRepository.findByUserId(user.getId()).orElse(null);
        if (sub != null && sub.getTier() == IndividualTier.pro) return;

        // No subscription row means the free tier, exactly as getPersonalQuota
        // reports it to the dashboard; the limit must not depend on whether a
        // row happens to exist.
        Integer max = getOverride(sub != null ? sub.getQuotaOverrides() : null, "max_active_games", 1);
        if (max == null) return;

        long current = gameRepository.countByCreatedByIdAndOrganizationIsNullAndStatusInAndTutorialScenarioIsNull(
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

    /**
     * Location check-in is an entitlement, not a counter: the free tier may
     * build NFC and QR bases only. Resolved per game so an org game follows
     * the org's plan and a personal game the creator's.
     */
    public boolean isLocationCheckInAllowed(Game game) {
        QuotaResponse.Limits limits;
        if (game.getOrganization() != null) {
            limits = resolveOrgLimits(game.getOrganization());
        } else {
            UserSubscription sub = userSubRepository.findByUserId(game.getCreatedBy().getId()).orElse(null);
            limits = resolvePersonalLimits(sub);
        }
        return !Boolean.FALSE.equals(limits.locationCheckIn());
    }

    /**
     * What the server will actually do: with enforcement off every plan may
     * use location check-in. The game response carries this so the client
     * mirrors the server instead of guessing from the viewer's workspace.
     */
    public boolean effectiveLocationCheckInAllowed(Game game) {
        return !enforcementEnabled || isLocationCheckInAllowed(game);
    }

    /**
     * Rejects a LOCATION base (or a LOCATION game default) on a plan that
     * does not include it. Called when a base is created or switched to
     * location, when the game default changes, on import, and again at
     * go-live so a plan downgrade cannot leave a live game the plan does
     * not cover.
     */
    public void enforceLocationCheckIn(Game game) {
        if (!enforcementEnabled) return;
        if (isLocationCheckInAllowed(game)) return;
        throw new BadRequestException(
            "Location check-in is not included in your plan",
            ErrorCode.QUOTA_LOCATION_CHECK_IN_NOT_ALLOWED);
    }

    /**
     * A practice game takes a single player, so the operator can open the
     * player app and see that side, and nothing more. This is a product rule
     * of practice games, not a subscription quota, so it ignores the
     * enforcement switch.
     */
    public void enforcePracticeGamePlayerLimit(Game game) {
        if (!game.isPracticeGame()) return;
        if (playerRepository.countByGameId(game.getId()) >= 1) {
            throw new BadRequestException(
                "A practice game takes a single player",
                ErrorCode.TUTORIAL_PRACTICE_GAME_PLAYER_LIMIT);
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
            case club -> 25 * GB;
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
                getOverride(sub != null ? sub.getQuotaOverrides() : null, "max_players_per_game", 50),
                getOverrideBoolean(sub != null ? sub.getQuotaOverrides() : null, LOCATION_CHECK_IN_KEY, false));
        }
        // Pro
        return new QuotaResponse.Limits(
            getOverride(sub.getQuotaOverrides(), "max_active_games", null),
            getOverride(sub.getQuotaOverrides(), "max_operators_per_game", 5),
            getOverride(sub.getQuotaOverrides(), "max_bases_per_game", null),
            getOverrideLong(sub.getQuotaOverrides(), "max_file_size_bytes", 2 * GB),
            null, null,
            getOverrideLong(sub.getQuotaOverrides(), "max_resource_storage_bytes", GB),
            getOverride(sub.getQuotaOverrides(), "max_players_per_game", null),
            getOverrideBoolean(sub.getQuotaOverrides(), LOCATION_CHECK_IN_KEY, true));
    }

    private QuotaResponse.Limits resolveOrgLimits(Organization org) {
        Map<String, Object> overrides = org.getQuotaOverrides();
        // Club: the shape of a standard deal. Every number here is a default
        // that the per-deal `quota_overrides` JSON on the org replaces, so
        // sales can agree anything without a code change or a new tier.
        if (org.getSubscriptionTier() == OrgTier.club) {
            return new QuotaResponse.Limits(
                null,
                getOverride(overrides, "max_operators_per_game", null),
                getOverride(overrides, "max_bases_per_game", null),
                getOverrideLong(overrides, "max_file_size_bytes", 2 * GB),
                getOverride(overrides, "max_members", 15),
                getOverride(overrides, "max_live_games", 10),
                getOverrideLong(overrides, "max_resource_storage_bytes", 25 * GB),
                getOverride(overrides, "max_players_per_game", 200),
                getOverrideBoolean(overrides, LOCATION_CHECK_IN_KEY, true));
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
            getOverride(overrides, "max_players_per_game", 50),
            getOverrideBoolean(overrides, LOCATION_CHECK_IN_KEY, false));
    }

    private Integer getOverride(Map<String, Object> overrides, String key, Integer defaultValue) {
        if (overrides != null && overrides.containsKey(key)) {
            Object val = overrides.get(key);
            if (val == null) return null;
            return ((Number) val).intValue();
        }
        return defaultValue;
    }

    private Boolean getOverrideBoolean(Map<String, Object> overrides, String key, Boolean defaultValue) {
        if (overrides != null && overrides.containsKey(key)) {
            Object val = overrides.get(key);
            if (val == null) return defaultValue;
            if (val instanceof Boolean b) return b;
            return Boolean.parseBoolean(String.valueOf(val));
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
