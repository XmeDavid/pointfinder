package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateAdminOrgRequest;
import com.prayer.pointfinder.dto.request.UpdateAdminOrgRequest;
import com.prayer.pointfinder.dto.response.AdminCreateOrgResponse;
import com.prayer.pointfinder.dto.response.OrgResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.OrgMembershipRepository;
import com.prayer.pointfinder.repository.OrganizationRepository;
import com.prayer.pointfinder.repository.UserRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * The sales side of clubs: an admin creates the org, adjusts its deal, and
 * hands ownership over. Everything here is behind {@code /api/admin/**}, which
 * SecurityConfig restricts to the ADMIN role.
 *
 * <p>Enum-valued fields are parsed here rather than with {@code valueOf} at the
 * controller, so a bad tier or status answers 400 with
 * {@code ORG_INVALID_ENUM_VALUE} instead of falling through to the generic
 * 500 handler.
 *
 * <p>No admin audit table exists in this schema — the V36 audit foundation
 * covers game actions, not platform administration — so each change writes an
 * {@code [ADMIN]} log line naming the acting admin and the target org.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class AdminOrgService {

    private final OrganizationRepository orgRepository;
    private final OrgMembershipRepository membershipRepository;
    private final UserRepository userRepository;
    private final OrganizationService organizationService;
    private final OrgInviteService orgInviteService;

    @Transactional
    public AdminCreateOrgResponse createOrg(CreateAdminOrgRequest request, String requestHost) {
        User admin = currentAdmin();
        // Addresses are matched and stored in lower case: an admin typing
        // `Coach@Club.pt` for an account registered as `coach@club.pt` used to
        // miss it and create an owner invite that address could never accept.
        String email = OrgInviteService.normalizeEmail(request.getAdminEmail());
        if (email == null || email.isEmpty()) {
            throw new BadRequestException("adminEmail is required", ErrorCode.ORG_ADMIN_EMAIL_INVALID);
        }

        validateQuotaOverrides(request.getQuotaOverrides());

        Optional<User> existing = userRepository.findByEmailIgnoreCase(email);

        // Until the invitee registers, the creating admin owns the org: the
        // created_by column is NOT NULL and an org with no owner cannot be
        // administered. Accepting the invite moves ownership across.
        User owner = existing.orElse(admin);

        Organization org = Organization.builder()
            .name(request.getName())
            .slug(organizationService.generateUniqueSlug(request.getName()))
            .createdBy(owner)
            .subscriptionTier(OrgTier.club)
            .subscriptionStatus(SubscriptionStatus.active)
            .quotaOverrides(request.getQuotaOverrides())
            .termEnd(request.getTermEnd())
            .adminNote(request.getAdminNote())
            .build();
        org = orgRepository.save(org);

        UUID adminUserId = null;
        UUID inviteId = null;

        if (existing.isPresent()) {
            membershipRepository.save(OrgMembership.builder()
                .organization(org)
                .user(existing.get())
                .permissions(OrgPermission.ALL)
                .build());
            adminUserId = existing.get().getId();
        } else {
            inviteId = orgInviteService.createOwnerInvite(org, email, admin, requestHost).getId();
        }

        log.info("[ADMIN] operation=createClub actor={} orgId={} name={} adminEmail={} "
                + "existingUser={} termEnd={} overrides={}",
            admin.getId(), org.getId(), org.getName(), email,
            existing.isPresent(), org.getTermEnd(), org.getQuotaOverrides());

        return new AdminCreateOrgResponse(
            organizationService.toResponse(org), email, adminUserId, inviteId);
    }

    @Transactional
    public OrgResponse updateOrg(UUID orgId, UpdateAdminOrgRequest request) {
        User admin = currentAdmin();
        Organization org = orgRepository.findById(orgId)
            .orElseThrow(() -> new ResourceNotFoundException("Organization", orgId));

        validateQuotaOverrides(request.getQuotaOverrides());

        if (request.getName() != null) org.setName(request.getName());
        if (request.getTier() != null) org.setSubscriptionTier(parseTier(request.getTier()));
        if (request.getStatus() != null) org.setSubscriptionStatus(parseStatus(request.getStatus()));
        if (request.getQuotaOverrides() != null) org.setQuotaOverrides(request.getQuotaOverrides());
        // These three are clearable, so presence — not nullness — decides
        // whether they are touched. An admin sending `"termEnd": null` means
        // "this club no longer has a term", which is a thing they must be able
        // to say; omitting the key still leaves the stored value alone.
        if (request.hasTermEnd()) org.setTermEnd(request.getTermEnd());
        if (request.hasGracePeriodEnd()) org.setGracePeriodEnd(request.getGracePeriodEnd());
        if (request.hasAdminNote()) org.setAdminNote(request.getAdminNote());

        org = orgRepository.save(org);

        log.info("[ADMIN] operation=updateClub actor={} orgId={} tier={} status={} termEnd={} overrides={}",
            admin.getId(), orgId, org.getSubscriptionTier(), org.getSubscriptionStatus(),
            org.getTermEnd(), org.getQuotaOverrides());

        return organizationService.toResponse(org);
    }

    /**
     * Moves ownership to an existing member and grants them every permission.
     * The target must already be a member: an org's owner is by definition
     * someone inside it, and silently adding them would hide a mistyped id.
     */
    @Transactional
    public OrgResponse transferOwnership(UUID orgId, UUID newOwnerId) {
        User admin = currentAdmin();
        Organization org = orgRepository.findById(orgId)
            .orElseThrow(() -> new ResourceNotFoundException("Organization", orgId));

        log.info("[ADMIN] operation=transferOwnership actor={} orgId={} newOwner={}",
            admin.getId(), orgId, newOwnerId);

        return organizationService.applyOwnershipTransfer(org, newOwnerId, admin);
    }

    /**
     * The override keys this backend resolves, and what each may hold. A value
     * outside its shape is a typo in a deal, not a server fault: read as JSON
     * it would either take the club's quota checks down or silently resolve to
     * the plan default. Keys outside this set pass through untouched — a deal
     * may legitimately carry a per-deal key the product does not read yet.
     */
    private static final Set<String> NUMERIC_OVERRIDE_KEYS = Set.of(
        "max_active_games",
        "max_members",
        "max_live_games",
        "max_players_per_game",
        "max_bases_per_game",
        "max_operators_per_game",
        "max_file_size_bytes",
        "max_resource_storage_bytes");

    private static final String BOOLEAN_OVERRIDE_KEY = "location_check_in";

    /**
     * Rejects a known override key whose value is neither null (unlimited, or
     * the tier default for the boolean) nor of the key's own type.
     */
    private void validateQuotaOverrides(Map<String, Object> overrides) {
        if (overrides == null) return;
        List<String> bad = overrides.entrySet().stream()
            .filter(e -> !isValidOverride(e.getKey(), e.getValue()))
            .map(Map.Entry::getKey)
            .sorted()
            .toList();
        if (!bad.isEmpty()) {
            throw new BadRequestException(
                "These quota overrides carry a value of the wrong type: " + String.join(", ", bad)
                    + ". Numeric limits take a number or null; " + BOOLEAN_OVERRIDE_KEY
                    + " takes true, false or null.",
                ErrorCode.ORG_INVALID_QUOTA_OVERRIDE);
        }
    }

    private boolean isValidOverride(String key, Object value) {
        if (value == null) return true;
        if (NUMERIC_OVERRIDE_KEYS.contains(key)) return value instanceof Number;
        if (BOOLEAN_OVERRIDE_KEY.equals(key)) return value instanceof Boolean;
        return true;
    }

    private OrgTier parseTier(String raw) {
        try {
            return OrgTier.valueOf(raw);
        } catch (IllegalArgumentException ex) {
            throw new BadRequestException(
                "Unknown tier '" + raw + "'. Expected one of: free, club.",
                ErrorCode.ORG_INVALID_ENUM_VALUE);
        }
    }

    private SubscriptionStatus parseStatus(String raw) {
        try {
            return SubscriptionStatus.valueOf(raw);
        } catch (IllegalArgumentException ex) {
            throw new BadRequestException(
                "Unknown status '" + raw + "'. Expected one of: active, past_due, grace_period, frozen, cancelled.",
                ErrorCode.ORG_INVALID_ENUM_VALUE);
        }
    }

    /** Reloads the acting admin so the org's created_by FK points at a managed entity. */
    private User currentAdmin() {
        UUID id = SecurityUtils.getCurrentUser().getId();
        return userRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("User", id));
    }
}
