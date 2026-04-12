package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.AdminSubscriptionOverrideRequest;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.OrganizationRepository;
import com.prayer.pointfinder.repository.UserSubscriptionRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import com.prayer.pointfinder.service.GameAccessService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
@Slf4j
public class AdminBillingController {

    private final UserSubscriptionRepository userSubRepository;
    private final OrganizationRepository orgRepository;
    private final GameAccessService gameAccessService;

    @PatchMapping("/users/{userId}/subscription")
    public ResponseEntity<Void> overrideUserSubscription(
            @PathVariable UUID userId,
            @RequestBody AdminSubscriptionOverrideRequest request) {
        gameAccessService.ensureCurrentUserIsAdmin();

        UserSubscription sub = userSubRepository.findByUserId(userId)
            .orElseThrow(() -> new ResourceNotFoundException("UserSubscription for user", userId));

        if (request.getTier() != null) sub.setTier(IndividualTier.valueOf(request.getTier()));
        if (request.getStatus() != null) sub.setStatus(SubscriptionStatus.valueOf(request.getStatus()));
        if (request.getBillingCycle() != null) sub.setBillingCycle(BillingCycle.valueOf(request.getBillingCycle()));
        if (request.getGracePeriodEnd() != null) sub.setGracePeriodEnd(request.getGracePeriodEnd());
        if (request.getQuotaOverrides() != null) sub.setQuotaOverrides(request.getQuotaOverrides());
        if (request.getAdminNote() != null) sub.setAdminNote(request.getAdminNote());

        userSubRepository.save(sub);
        log.info("[ADMIN] operation=overrideUserSub userId={} admin={}",
            userId, SecurityUtils.getCurrentUser().getId());
        return ResponseEntity.ok().build();
    }

    @PatchMapping("/orgs/{orgId}/subscription")
    public ResponseEntity<Void> overrideOrgSubscription(
            @PathVariable UUID orgId,
            @RequestBody AdminSubscriptionOverrideRequest request) {
        gameAccessService.ensureCurrentUserIsAdmin();

        Organization org = orgRepository.findById(orgId)
            .orElseThrow(() -> new ResourceNotFoundException("Organization", orgId));

        if (request.getTier() != null) org.setSubscriptionTier(OrgTier.valueOf(request.getTier()));
        if (request.getStatus() != null) org.setSubscriptionStatus(SubscriptionStatus.valueOf(request.getStatus()));
        if (request.getGracePeriodEnd() != null) org.setGracePeriodEnd(request.getGracePeriodEnd());
        if (request.getQuotaOverrides() != null) org.setQuotaOverrides(request.getQuotaOverrides());
        if (request.getAdminNote() != null) org.setAdminNote(request.getAdminNote());

        orgRepository.save(org);
        log.info("[ADMIN] operation=overrideOrgSub orgId={} admin={}",
            orgId, SecurityUtils.getCurrentUser().getId());
        return ResponseEntity.ok().build();
    }
}
