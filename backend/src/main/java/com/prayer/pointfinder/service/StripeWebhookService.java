package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.repository.OrganizationRepository;
import com.prayer.pointfinder.repository.UserSubscriptionRepository;
import com.stripe.model.Invoice;
import com.stripe.model.Subscription;
import com.stripe.model.checkout.Session;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Service
@Slf4j
@RequiredArgsConstructor
public class StripeWebhookService {

    private final UserSubscriptionRepository userSubRepository;
    private final OrganizationRepository orgRepository;

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
            sub.setStripeCustomerId(customerId);
            sub.setStripeSubscriptionId(subscriptionId);
            sub.setTier(IndividualTier.pro);
            sub.setStatus(SubscriptionStatus.active);
            sub.setBillingCycle(BillingCycle.monthly);
            sub.setGracePeriodEnd(null);
            userSubRepository.save(sub);
            log.info("[WEBHOOK] checkout completed userId={} tier=pro", userId);

        } else if (clientRef.startsWith("org:")) {
            UUID orgId = UUID.fromString(clientRef.substring(4));
            Organization org = orgRepository.findById(orgId).orElse(null);
            if (org == null) {
                log.warn("[WEBHOOK] No Organization for orgId={}", orgId);
                return;
            }
            org.setStripeCustomerId(customerId);
            org.setStripeSubscriptionId(subscriptionId);
            org.setSubscriptionStatus(SubscriptionStatus.active);
            org.setGracePeriodEnd(null);
            orgRepository.save(org);
            log.info("[WEBHOOK] checkout completed orgId={}", orgId);
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
