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

    /** One more base on an existing game. */
    public void enforceBasesPerGameLimit(Game game) {
        if (!enforcementEnabled) return;
        enforceBaseCount(game, gameRepository.countBasesByGameId(game.getId()), 1);
    }

    /**
     * The whole imported batch, checked before the first base row is written.
     * An import that would land over the limit is refused up front with one
     * clear error, rather than failing partway through and rolling back work
     * the operator has already watched start.
     *
     * <p>Takes the game before it is persisted — the limit resolves from its
     * owner, not from anything in the database — so the count is always
     * against a fresh game's zero bases.
     */
    public void enforceImportedBasesLimit(Game game, int importedBases) {
        if (!enforcementEnabled) return;
        enforceBaseCount(game, 0, importedBases);
    }

    private void enforceBaseCount(Game game, long current, int additional) {
        Integer max = resolveGameLimits(game).maxBasesPerGame();
        if (max == null) return;
        if (current + additional > max) {
            throw new BadRequestException("Base limit reached (" + max + ")", ErrorCode.QUOTA_BASES_PER_GAME_EXCEEDED);
        }
    }

    /**
     * One more operator on the game. Called both when an invite is created and
     * again when it is accepted: an invite sent under the limit can otherwise
     * be accepted long after other operators have filled the game.
     */
    public void enforceOperatorsPerGameLimit(Game game) {
        if (!enforcementEnabled) return;
        Integer max = resolveGameLimits(game).maxOperatorsPerGame();
        if (max == null) return;

        long current = gameRepository.countOperatorsByGameId(game.getId());
        if (current >= max) {
            throw new BadRequestException("Operator limit reached (" + max + ")", ErrorCode.QUOTA_OPERATORS_PER_GAME_EXCEEDED);
        }
    }

    /**
     * Rejects an upload larger than the plan's per-file cap, on every path
     * that accepts bytes: a direct multipart submission, a chunked upload
     * session (checked at creation, so a player is told before the first
     * chunk leaves the device), and an operator resource upload.
     */
    public void enforceFileSizeLimit(Game game, long sizeBytes) {
        if (!enforcementEnabled) return;
        enforceFileSize(getMaxFileSizeBytesOrNull(game), sizeBytes);
    }

    /** By game id, for the direct multipart submission upload. */
    @Transactional(readOnly = true)
    public void enforceFileSizeLimit(UUID gameId, long sizeBytes) {
        if (!enforcementEnabled) return;
        Game game = gameRepository.findById(gameId)
            .orElseThrow(() -> new ResourceNotFoundException("Game", gameId));
        enforceFileSizeLimit(game, sizeBytes);
    }

    /** The org-resource path: a resource can belong to an org with no game. */
    public void enforceOrgFileSizeLimit(Organization org, long sizeBytes) {
        if (!enforcementEnabled) return;
        enforceFileSize(resolveOrgLimits(org).maxFileSizeBytes(), sizeBytes);
    }

    private void enforceFileSize(Long max, long sizeBytes) {
        if (max == null) return; // an override of null means unlimited
        if (sizeBytes > max) {
            throw new BadRequestException(
                "File size exceeds the limit for this plan (" + max + " bytes)",
                ErrorCode.QUOTA_FILE_SIZE_EXCEEDED);
        }
    }

    /**
     * The organization's member limit. Unlike the per-game quotas this is not
     * behind {@code app.quota.enforcement-enabled}: a seat count is what a
     * club deal actually buys, so it holds in every deployment. It carries a
     * code now so clients can tell it apart from a validation error.
     */
    public void enforceOrgMemberLimit(Organization org) {
        int max = getMaxMembers(org);
        if (max <= 0) return;
        if (membershipRepository.countByOrganizationId(org.getId()) >= max) {
            throw new BadRequestException(
                "Organization has reached its member limit (" + max + ")",
                ErrorCode.QUOTA_ORG_MEMBERS_EXCEEDED);
        }
    }

    /**
     * Location check-in is an entitlement, not a counter: the free tier may
     * build NFC and QR bases only. Resolved per game so an org game follows
     * the org's plan and a personal game the creator's.
     */
    public boolean isLocationCheckInAllowed(Game game) {
        return !Boolean.FALSE.equals(resolveGameLimits(game).locationCheckIn());
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
        Integer max = resolveGameLimits(game).maxPlayersPerGame();
        if (max == null) return;

        long current = playerRepository.countByGameId(game.getId());
        if (current >= max) {
            throw new BadRequestException("Player limit reached (" + max + ")", ErrorCode.QUOTA_PLAYERS_PER_GAME_EXCEEDED);
        }
    }

    private int getMaxMembers(Organization org) {
        QuotaResponse.Limits limits = resolveOrgLimits(org);
        return limits.maxMembers() != null ? limits.maxMembers() : Integer.MAX_VALUE;
    }

    /** Null means unlimited — an explicit {@code null} override. */
    private Long getMaxFileSizeBytesOrNull(Game game) {
        return resolveGameLimits(game).maxFileSizeBytes();
    }

    /**
     * The org's storage allowance, or null for unlimited.
     *
     * <p>Resolved through {@link #resolveOrgLimits} like every other limit, so
     * an explicit {@code "max_resource_storage_bytes": null} means unlimited
     * here exactly as it does on the dashboard, in {@code enforceFileSize} and
     * in the admin form. Reading the override map directly used to treat that
     * null as "no override" and quietly fall back to the club's 25 GB, so a
     * deal that agreed unlimited storage was capped anyway.
     */
    public Long getMaxResourceStorageBytes(Organization org) {
        return resolveOrgLimits(org).maxResourceStorageBytes();
    }

    /** The personal twin, with the same null-is-unlimited contract. */
    public Long getMaxPersonalResourceStorageBytes(User user) {
        UserSubscription sub = userSubRepository.findByUserId(user.getId()).orElse(null);
        return resolvePersonalLimits(sub).maxResourceStorageBytes();
    }

    // --- Limit Resolution ---

    /**
     * The limits that bound a game: the owning organization's when it has one,
     * otherwise the creator's personal plan. Every per-game quota resolves
     * through here so ownership is read one way and one way only.
     */
    private QuotaResponse.Limits resolveGameLimits(Game game) {
        if (game.getOrganization() != null) {
            return resolveOrgLimits(game.getOrganization());
        }
        UserSubscription sub = userSubRepository.findByUserId(game.getCreatedBy().getId()).orElse(null);
        return resolvePersonalLimits(sub);
    }

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

    /**
     * A numeric override, read defensively. {@code quota_overrides} is free
     * JSON on the org row: a deal typed as {@code {"max_members": "40"}} used
     * to throw a ClassCastException out of every quota check and take the
     * whole club down with it. A number is used, a numeric string is parsed,
     * and anything else falls back to the plan default with a warning — a
     * misconfigured deal degrades to the standard limits instead of breaking.
     */
    private Integer getOverride(Map<String, Object> overrides, String key, Integer defaultValue) {
        if (overrides != null && overrides.containsKey(key)) {
            Object val = overrides.get(key);
            if (val == null) return null;
            if (val instanceof Number n) return n.intValue();
            Long parsed = parseNumeric(val, key);
            if (parsed != null) return parsed.intValue();
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

    /** The 64-bit twin of {@link #getOverride}, equally defensive. */
    private Long getOverrideLong(Map<String, Object> overrides, String key, Long defaultValue) {
        if (overrides != null && overrides.containsKey(key)) {
            Object val = overrides.get(key);
            if (val == null) return null;
            if (val instanceof Number n) return n.longValue();
            Long parsed = parseNumeric(val, key);
            if (parsed != null) return parsed;
        }
        return defaultValue;
    }

    /** A numeric string, or null with a warning when the value is not one. */
    private Long parseNumeric(Object val, String key) {
        try {
            return Long.parseLong(String.valueOf(val).trim());
        } catch (NumberFormatException ex) {
            log.warn("[QUOTA] override {} is not a number ({}), using the plan default", key, val);
            return null;
        }
    }
}
