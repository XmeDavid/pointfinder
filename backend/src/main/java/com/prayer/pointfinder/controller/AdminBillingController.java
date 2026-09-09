package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.AdminSubscriptionOverrideRequest;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.UserSubscriptionRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import com.prayer.pointfinder.service.GameAccessService;
import com.prayer.pointfinder.service.StorageMigrationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
@Slf4j
public class AdminBillingController {

    private final UserSubscriptionRepository userSubRepository;
    private final GameAccessService gameAccessService;
    private final StorageMigrationService storageMigrationService;

    @PatchMapping("/users/{userId}/subscription")
    public ResponseEntity<Void> overrideUserSubscription(
            @PathVariable UUID userId,
            @Valid @RequestBody AdminSubscriptionOverrideRequest request) {
        gameAccessService.ensureCurrentUserIsAdmin();

        UserSubscription sub = userSubRepository.findByUserId(userId)
            .orElseThrow(() -> new ResourceNotFoundException("UserSubscription for user", userId));

        // Parsed defensively: an unknown value is the admin's typo, not a
        // server fault, so it answers 400 with ORG_INVALID_ENUM_VALUE.
        if (request.getTier() != null) sub.setTier(parseEnum(IndividualTier.class, request.getTier(), "tier"));
        if (request.getStatus() != null) sub.setStatus(parseEnum(SubscriptionStatus.class, request.getStatus(), "status"));
        if (request.getBillingCycle() != null) sub.setBillingCycle(parseEnum(BillingCycle.class, request.getBillingCycle(), "billingCycle"));
        if (request.getGracePeriodEnd() != null) sub.setGracePeriodEnd(request.getGracePeriodEnd());
        if (request.getQuotaOverrides() != null) sub.setQuotaOverrides(request.getQuotaOverrides());
        if (request.getAdminNote() != null) sub.setAdminNote(request.getAdminNote());

        userSubRepository.save(sub);
        log.info("[ADMIN] operation=overrideUserSub userId={} admin={}",
            userId, SecurityUtils.getCurrentUser().getId());
        return ResponseEntity.ok().build();
    }

    // The org override that used to live here is now
    // PATCH /api/admin/orgs/{orgId} in AdminOrgController: one endpoint that
    // covers name, tier, status, term, quota overrides and the admin note, and
    // that validates enum values instead of letting a typo become a 500.

    @PostMapping("/migrate-storage")
    public ResponseEntity<Map<String, Object>> migrateStorage() {
        gameAccessService.ensureCurrentUserIsAdmin();
        log.info("[ADMIN] operation=migrateStorage admin={}", SecurityUtils.getCurrentUser().getId());
        Map<String, Object> result = storageMigrationService.migrateLocalToS3();
        return ResponseEntity.ok(result);
    }

    private <E extends Enum<E>> E parseEnum(Class<E> type, String raw, String field) {
        try {
            return Enum.valueOf(type, raw);
        } catch (IllegalArgumentException ex) {
            throw new BadRequestException(
                "Unknown " + field + " '" + raw + "'. Expected one of: "
                    + Arrays.toString(type.getEnumConstants()) + ".",
                ErrorCode.ORG_INVALID_ENUM_VALUE);
        }
    }
}
