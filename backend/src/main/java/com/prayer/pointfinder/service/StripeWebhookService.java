package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.repository.OrgMembershipRepository;
import com.prayer.pointfinder.repository.OrganizationRepository;
import com.prayer.pointfinder.repository.UserRepository;
import com.prayer.pointfinder.repository.UserSubscriptionRepository;
import com.stripe.model.Invoice;
import com.stripe.model.Subscription;
import com.stripe.model.checkout.Session;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Service
@Slf4j
@RequiredArgsConstructor
public class StripeWebhookService {

    private final UserSubscriptionRepository userSubRepository;
    private final OrganizationRepository orgRepository;
    private final UserRepository userRepository;
    private final OrgMembershipRepository membershipRepository;

    @Transactional
    public void handleCheckoutCompleted(Session session) {
        String clientRef = session.getClientReferenceId();
        String customerId = session.getCustomer();
        String subscriptionId = session.getSubscription();

        if (clientRef == null) {
            log.warn("[WEBHOOK] checkout.session.completed with no clientReferenceId");
            return;
        }

        if (clientRef.startsWith("user:")) {
            UUID userId = UUID.fromString(clientRef.substring(5));
            UserSubscription sub = userSubRepository.findByUserId(userId).orElse(null);
            if (sub == null) {
                log.warn("[WEBHOOK] No UserSubscription for userId={}", userId);
                return;
            }

            Map<String, String> metadata = session.getMetadata();
            String cycleStr = metadata != null ? metadata.get("billing_cycle") : null;
            BillingCycle cycle = BillingCycle.monthly; // safe default
            if ("annual".equals(cycleStr)) cycle = BillingCycle.annual;
            else if ("lifetime".equals(cycleStr)) cycle = BillingCycle.lifetime;

            sub.setStripeCustomerId(customerId);
            sub.setStripeSubscriptionId(subscriptionId);
            sub.setTier(IndividualTier.pro);
            sub.setStatus(SubscriptionStatus.active);
            sub.setBillingCycle(cycle);
            sub.setGracePeriodEnd(null);
            userSubRepository.save(sub);
            log.info("[WEBHOOK] checkout completed userId={} tier=pro cycle={}", userId, cycle);

        } else if (clientRef.startsWith("org:")) {
            UUID orgId = UUID.fromString(clientRef.substring(4));
            Organization org = orgRepository.findById(orgId).orElse(null);
            if (org == null) {
                log.warn("[WEBHOOK] No Organization for orgId={}", orgId);
                return;
            }

            Map<String, String> metadata = session.getMetadata();
            String plan = metadata != null ? metadata.get("plan") : null;
            if (plan != null) {
                OrgTier tier = plan.contains("high") ? OrgTier.high : OrgTier.base;
                org.setSubscriptionTier(tier);
            }

            org.setStripeCustomerId(customerId);
            org.setStripeSubscriptionId(subscriptionId);
            org.setSubscriptionStatus(SubscriptionStatus.active);
            org.setGracePeriodEnd(null);
            orgRepository.save(org);
            log.info("[WEBHOOK] checkout completed orgId={} tier={}", orgId, org.getSubscriptionTier());

        } else if (clientRef.startsWith("new-org:")) {
            UUID userId = UUID.fromString(clientRef.substring(8));
            User user = userRepository.findById(userId).orElse(null);
            if (user == null) {
                log.warn("[WEBHOOK] No user for userId={}", userId);
                return;
            }

            Map<String, String> metadata = session.getMetadata();
            String orgName = metadata != null ? metadata.get("org_name") : "New Organization";
            if (orgName == null || orgName.isBlank()) orgName = "New Organization";
            String orgPlan = metadata != null ? metadata.get("org_plan") : "org-base";
            if (orgPlan == null) orgPlan = "org-base";

            OrgTier tier = orgPlan.contains("high") ? OrgTier.high : OrgTier.base;

            // Generate slug from org name
            String slug = orgName.toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
            if (slug.isEmpty()) slug = "org";
            // Make unique if needed
            if (orgRepository.existsBySlug(slug)) {
                slug = slug + "-" + UUID.randomUUID().toString().substring(0, 6);
            }

            Organization org = Organization.builder()
                .name(orgName)
                .slug(slug)
                .createdBy(user)
                .stripeCustomerId(customerId)
                .stripeSubscriptionId(subscriptionId)
                .subscriptionTier(tier)
                .subscriptionStatus(SubscriptionStatus.active)
                .build();
            org = orgRepository.save(org);

            OrgMembership membership = OrgMembership.builder()
                .organization(org)
                .user(user)
                .permissions(OrgPermission.ALL)
                .build();
            membershipRepository.save(membership);

            log.info("[WEBHOOK] new org created orgId={} name={} tier={} userId={}",
                org.getId(), orgName, tier, userId);
        }
    }

    @Transactional
    public void handleInvoicePaid(Invoice invoice) {
        String customerId = invoice.getCustomer();
        resetToActive(customerId);
        log.info("[WEBHOOK] invoice.paid customerId={}", customerId);
    }

    @Transactional
    public void handleInvoicePaymentFailed(Invoice invoice) {
        String customerId = invoice.getCustomer();

        UserSubscription userSub = userSubRepository.findByStripeCustomerId(customerId).orElse(null);
        if (userSub != null) {
            userSub.setStatus(SubscriptionStatus.past_due);
            userSubRepository.save(userSub);
            log.info("[WEBHOOK] invoice.payment_failed userId={}", userSub.getUser().getId());
            return;
        }

        Organization org = orgRepository.findByStripeCustomerId(customerId).orElse(null);
        if (org != null) {
            org.setSubscriptionStatus(SubscriptionStatus.past_due);
            orgRepository.save(org);
            log.info("[WEBHOOK] invoice.payment_failed orgId={}", org.getId());
        }
    }

    @Transactional
    public void handleSubscriptionDeleted(Subscription subscription) {
        String customerId = subscription.getCustomer();

        UserSubscription userSub = userSubRepository.findByStripeCustomerId(customerId).orElse(null);
        if (userSub != null) {
            userSub.setStatus(SubscriptionStatus.cancelled);
            userSub.setTier(IndividualTier.free);
            userSub.setStripeSubscriptionId(null);
            userSub.setCurrentPeriodEnd(null);
            userSubRepository.save(userSub);
            log.info("[WEBHOOK] subscription.deleted userId={} -> free", userSub.getUser().getId());
            return;
        }

        Organization org = orgRepository.findByStripeCustomerId(customerId).orElse(null);
        if (org != null) {
            org.setSubscriptionStatus(SubscriptionStatus.cancelled);
            org.setSubscriptionTier(OrgTier.free);
            org.setStripeSubscriptionId(null);
            orgRepository.save(org);
            log.info("[WEBHOOK] subscription.deleted orgId={} -> free", org.getId());
        }
    }

    @Transactional
    public void handleSubscriptionUpdated(Subscription subscription) {
        String customerId = subscription.getCustomer();
        Instant periodEnd = Instant.ofEpochSecond(subscription.getCurrentPeriodEnd());

        UserSubscription userSub = userSubRepository.findByStripeCustomerId(customerId).orElse(null);
        if (userSub != null) {
            userSub.setCurrentPeriodEnd(periodEnd);
            userSubRepository.save(userSub);
            return;
        }

        Organization org = orgRepository.findByStripeCustomerId(customerId).orElse(null);
        if (org != null) {
            orgRepository.save(org);
        }
    }

    private void resetToActive(String customerId) {
        UserSubscription userSub = userSubRepository.findByStripeCustomerId(customerId).orElse(null);
        if (userSub != null) {
            userSub.setStatus(SubscriptionStatus.active);
            userSub.setGracePeriodEnd(null);
            userSubRepository.save(userSub);
            return;
        }

        Organization org = orgRepository.findByStripeCustomerId(customerId).orElse(null);
        if (org != null) {
            org.setSubscriptionStatus(SubscriptionStatus.active);
            org.setGracePeriodEnd(null);
            orgRepository.save(org);
        }
    }
}
