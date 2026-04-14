package com.prayer.pointfinder.service;

import com.prayer.pointfinder.config.StripeConfig;
import com.prayer.pointfinder.dto.request.CreateCheckoutRequest;
import com.prayer.pointfinder.dto.response.CheckoutResponse;
import com.prayer.pointfinder.dto.response.UserSubscriptionResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.OrganizationRepository;
import com.prayer.pointfinder.repository.UserSubscriptionRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import com.stripe.exception.StripeException;
import com.stripe.model.checkout.Session;
import com.stripe.param.checkout.SessionCreateParams;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@Slf4j
@RequiredArgsConstructor
public class BillingService {

    private final StripeConfig stripeConfig;
    private final UserSubscriptionRepository userSubRepository;
    private final OrganizationRepository orgRepository;
    private final OrganizationService organizationService;

    private void ensureStripeConfigured() {
        if (stripeConfig.getSecretKey() == null || stripeConfig.getSecretKey().isBlank()) {
            throw new BadRequestException("Stripe is not configured. Please set STRIPE_SECRET_KEY.");
        }
    }

    @Transactional
    public CheckoutResponse createCheckoutSession(CreateCheckoutRequest request) {
        ensureStripeConfigured();
        User currentUser = SecurityUtils.getCurrentUser();
        String priceId = resolvePriceId(request.getPlan(), request.getCycle());

        if (priceId == null || priceId.isBlank()) {
            throw new BadRequestException("Stripe price not configured for plan: " + request.getPlan() + "/" + request.getCycle());
        }

        String customerId = null;
        String clientReferenceId;

        if (request.getOrgId() != null) {
            organizationService.ensureCurrentUserHasPermission(request.getOrgId(), OrgPermission.MANAGE_BILLING);
            Organization org = orgRepository.findById(request.getOrgId())
                .orElseThrow(() -> new ResourceNotFoundException("Organization", request.getOrgId()));
            customerId = org.getStripeCustomerId();
            clientReferenceId = "org:" + org.getId();
        } else {
            UserSubscription sub = userSubRepository.findByUserId(currentUser.getId()).orElse(null);
            if (sub != null) {
                customerId = sub.getStripeCustomerId();
            }
            clientReferenceId = "user:" + currentUser.getId();
        }

        try {
            SessionCreateParams.Builder builder = SessionCreateParams.builder()
                .setMode(SessionCreateParams.Mode.SUBSCRIPTION)
                .setSuccessUrl(stripeConfig.getSuccessUrl() + "?session_id={CHECKOUT_SESSION_ID}")
                .setCancelUrl(stripeConfig.getCancelUrl())
                .setClientReferenceId(clientReferenceId)
                .putMetadata("plan", request.getPlan())
                .putMetadata("billing_cycle", request.getCycle())
                .addLineItem(SessionCreateParams.LineItem.builder()
                    .setPrice(priceId)
                    .setQuantity(1L)
                    .build());

            if (customerId != null) {
                builder.setCustomer(customerId);
            } else {
                builder.setCustomerEmail(currentUser.getEmail());
            }

            Session session = Session.create(builder.build());

            log.info("[BILLING] operation=createCheckout user={} plan={} cycle={} orgId={}",
                currentUser.getId(), request.getPlan(), request.getCycle(), request.getOrgId());

            return CheckoutResponse.builder()
                .url(session.getUrl())
                .sessionId(session.getId())
                .build();
        } catch (Exception e) {
            log.error("[BILLING] Stripe checkout creation failed: {}", e.getMessage(), e);
            throw new BadRequestException("Failed to create checkout session: " + e.getMessage());
        }
    }

    public String createPortalSession() {
        ensureStripeConfigured();
        User currentUser = SecurityUtils.getCurrentUser();
        UserSubscription sub = userSubRepository.findByUserId(currentUser.getId())
            .orElseThrow(() -> new BadRequestException("No subscription found"));

        if (sub.getStripeCustomerId() == null) {
            throw new BadRequestException("No Stripe customer associated with your account");
        }

        try {
            com.stripe.param.billingportal.SessionCreateParams params =
                com.stripe.param.billingportal.SessionCreateParams.builder()
                    .setCustomer(sub.getStripeCustomerId())
                    .setReturnUrl(stripeConfig.getSuccessUrl())
                    .build();
            com.stripe.model.billingportal.Session portalSession =
                com.stripe.model.billingportal.Session.create(params);
            return portalSession.getUrl();
        } catch (StripeException e) {
            log.error("[BILLING] Stripe portal creation failed: {}", e.getMessage());
            throw new BadRequestException("Failed to create billing portal session");
        }
    }

    public String createOrgPortalSession(UUID orgId) {
        ensureStripeConfigured();
        organizationService.ensureCurrentUserHasPermission(orgId, OrgPermission.MANAGE_BILLING);

        Organization org = orgRepository.findById(orgId)
            .orElseThrow(() -> new ResourceNotFoundException("Organization", orgId));

        if (org.getStripeCustomerId() == null) {
            throw new BadRequestException("No Stripe customer associated with this organization");
        }

        try {
            com.stripe.param.billingportal.SessionCreateParams params =
                com.stripe.param.billingportal.SessionCreateParams.builder()
                    .setCustomer(org.getStripeCustomerId())
                    .setReturnUrl(stripeConfig.getSuccessUrl())
                    .build();
            com.stripe.model.billingportal.Session portalSession =
                com.stripe.model.billingportal.Session.create(params);
            return portalSession.getUrl();
        } catch (StripeException e) {
            log.error("[BILLING] Stripe org portal creation failed: {}", e.getMessage());
            throw new BadRequestException("Failed to create billing portal session");
        }
    }

    @Transactional(readOnly = true)
    public UserSubscriptionResponse getSubscriptionStatus() {
        User currentUser = SecurityUtils.getCurrentUser();
        UserSubscription sub = userSubRepository.findByUserId(currentUser.getId())
            .orElse(UserSubscription.builder().tier(IndividualTier.free).status(SubscriptionStatus.active).build());

        return UserSubscriptionResponse.builder()
            .id(sub.getId())
            .tier(sub.getTier().name())
            .status(sub.getStatus().name())
            .billingCycle(sub.getBillingCycle() != null ? sub.getBillingCycle().name() : null)
            .currentPeriodEnd(sub.getCurrentPeriodEnd())
            .gracePeriodEnd(sub.getGracePeriodEnd())
            .quotaOverrides(sub.getQuotaOverrides())
            .build();
    }

    @Transactional
    public CheckoutResponse createOrgCheckoutSession(String orgName, String plan, String cycle) {
        ensureStripeConfigured();
        User currentUser = SecurityUtils.getCurrentUser();
        String priceId = resolvePriceId(plan, cycle);

        if (priceId == null || priceId.isBlank()) {
            throw new BadRequestException("Stripe price not configured for plan: " + plan + "/" + cycle);
        }

        // Don't create the org yet — store info in Stripe metadata
        String clientReferenceId = "new-org:" + currentUser.getId();

        try {
            SessionCreateParams.Builder builder = SessionCreateParams.builder()
                .setMode(SessionCreateParams.Mode.SUBSCRIPTION)
                .setSuccessUrl(stripeConfig.getSuccessUrl() + "?session_id={CHECKOUT_SESSION_ID}&new_org=true")
                .setCancelUrl(stripeConfig.getCancelUrl())
                .setClientReferenceId(clientReferenceId)
                .setCustomerEmail(currentUser.getEmail())
                .putMetadata("org_name", orgName)
                .putMetadata("org_plan", plan)
                .putMetadata("billing_cycle", cycle)
                .addLineItem(SessionCreateParams.LineItem.builder()
                    .setPrice(priceId)
                    .setQuantity(1L)
                    .build());

            Session session = Session.create(builder.build());

            log.info("[BILLING] operation=createOrgCheckout user={} orgName={} plan={} cycle={}",
                currentUser.getId(), orgName, plan, cycle);

            return CheckoutResponse.builder()
                .url(session.getUrl())
                .sessionId(session.getId())
                .build();
        } catch (StripeException e) {
            log.error("[BILLING] Stripe org checkout creation failed: {}", e.getMessage());
            throw new BadRequestException("Failed to create checkout session: " + e.getMessage());
        }
    }

    private String resolvePriceId(String plan, String cycle) {
        return switch (plan + "-" + cycle) {
            case "pro-monthly" -> stripeConfig.getPriceProMonthly();
            case "pro-annual" -> stripeConfig.getPriceProAnnual();
            case "org-base-monthly" -> stripeConfig.getPriceOrgBaseMonthly();
            case "org-base-annual" -> stripeConfig.getPriceOrgBaseAnnual();
            case "org-high-monthly" -> stripeConfig.getPriceOrgHighMonthly();
            case "org-high-annual" -> stripeConfig.getPriceOrgHighAnnual();
            default -> null;
        };
    }
}
