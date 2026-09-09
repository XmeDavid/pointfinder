package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.repository.OrgInvoiceRepository;
import com.prayer.pointfinder.repository.OrganizationRepository;
import com.prayer.pointfinder.repository.StripeEventRepository;
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
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;

/**
 * Applies Stripe events.
 *
 * <p><b>Idempotency.</b> Stripe redelivers an event whenever the endpoint does
 * not answer 2xx, and on its own retry schedule besides. Every handler runs
 * through {@link #applyOnce}, which inserts the event id into
 * {@code stripe_events} inside the same transaction as the effect: a
 * redelivery finds the row, logs, and does nothing. Because the insert and the
 * effect share one transaction, a handler that throws leaves neither behind
 * and Stripe's next delivery gets a real attempt.
 *
 * <p><b>Two billing models.</b> Personal subscriptions are self-serve and
 * carry a {@code user:<id>} client reference; the subscription handlers below
 * are theirs. Clubs hold no subscription at all: an admin issues an invoice
 * and paying it extends {@code organizations.term_end}.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class StripeWebhookService {

    private final UserSubscriptionRepository userSubRepository;
    private final OrganizationRepository orgRepository;
    private final UserRepository userRepository;
    private final OrgInvoiceRepository orgInvoiceRepository;
    private final StripeEventRepository stripeEventRepository;
    private final SubscriptionLifecycleService lifecycleService;

    /**
     * Runs {@code effect} unless this event has already been applied, then
     * records it. Returns false when the event was a redelivery.
     */
    @Transactional
    public boolean applyOnce(String eventId, String eventType, Runnable effect) {
        if (eventId != null && stripeEventRepository.existsById(eventId)) {
            log.info("[WEBHOOK] event={} type={} already processed, skipping", eventId, eventType);
            return false;
        }
        effect.run();
        if (eventId != null) {
            stripeEventRepository.save(StripeEvent.builder()
                .id(eventId)
                .type(eventType)
                .processedAt(Instant.now())
                .build());
        }
        return true;
    }

    @Transactional
    public void handleCheckoutCompleted(Session session) {
        String clientRef = session.getClientReferenceId();
        String customerId = session.getCustomer();
        String subscriptionId = session.getSubscription();

        if (clientRef == null || !clientRef.startsWith("user:")) {
            // Org checkout was removed with the club model: the only client
            // reference this backend mints is user:<id>. Anything else is a
            // stale session from before the change, or another integration.
            log.warn("[WEBHOOK] checkout.session.completed with unsupported clientReferenceId={}", clientRef);
            return;
        }

        UUID userId = UUID.fromString(clientRef.substring(5));
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) {
            log.warn("[WEBHOOK] No user for userId={}", userId);
            return;
        }
        UserSubscription sub = userSubRepository.findByUserId(userId)
                .orElseGet(() -> {
                    log.info("[WEBHOOK] Creating missing UserSubscription for userId={}", userId);
                    return UserSubscription.builder()
                            .user(user)
                            .tier(IndividualTier.free)
                            .status(SubscriptionStatus.active)
                            .build();
                });

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
    }

    /**
     * A paid invoice. For a personal subscription it simply clears any dunning
     * state. For a club it is the whole payment model: the invoice's
     * {@code termMonths} extends the term from whichever is later — now, or
     * the term the club already has — so renewing early adds to the term
     * instead of truncating it, and renewing late does not backdate it.
     */
    @Transactional
    public void handleInvoicePaid(Invoice invoice) {
        OrgInvoice orgInvoice = orgInvoiceRepository.findByStripeInvoiceId(invoice.getId()).orElse(null);
        if (orgInvoice != null) {
            applyClubPayment(orgInvoice);
            return;
        }
        resetToActive(invoice.getCustomer());
        log.info("[WEBHOOK] invoice.paid customerId={}", invoice.getCustomer());
    }

    /** A club invoice Stripe will never collect: record it, leave the term alone. */
    @Transactional
    public void handleInvoiceClosed(Invoice invoice, String status) {
        OrgInvoice orgInvoice = orgInvoiceRepository.findByStripeInvoiceId(invoice.getId()).orElse(null);
        if (orgInvoice == null) {
            log.debug("[WEBHOOK] invoice {} is not a club invoice, ignoring status {}", invoice.getId(), status);
            return;
        }
        orgInvoice.setStatus(status);
        orgInvoiceRepository.save(orgInvoice);
        log.info("[WEBHOOK] club invoice {} orgId={} -> {}",
            invoice.getId(), orgInvoice.getOrganization().getId(), status);
    }

    private void applyClubPayment(OrgInvoice orgInvoice) {
        Instant now = Instant.now();
        Organization org = orgInvoice.getOrganization();

        Instant base = org.getTermEnd() != null && org.getTermEnd().isAfter(now) ? org.getTermEnd() : now;
        Instant newTermEnd = base.atZone(ZoneOffset.UTC)
            .plusMonths(orgInvoice.getTermMonths())
            .toInstant()
            .truncatedTo(ChronoUnit.SECONDS);

        org.setTermEnd(newTermEnd);
        org.setSubscriptionStatus(SubscriptionStatus.active);
        org.setGracePeriodEnd(null);
        orgRepository.save(org);

        orgInvoice.setStatus("paid");
        orgInvoice.setPaidAt(now);
        orgInvoiceRepository.save(orgInvoice);

        log.info("[WEBHOOK] club invoice paid orgId={} invoiceId={} termMonths={} termEnd={}",
            org.getId(), orgInvoice.getStripeInvoiceId(), orgInvoice.getTermMonths(), newTermEnd);
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
        }
        // A club never holds a subscription, so there is no org branch here.
    }

    @Transactional
    public void handleSubscriptionUpdated(Subscription subscription) {
        String customerId = subscription.getCustomer();
        Instant periodEnd = Instant.ofEpochSecond(subscription.getCurrentPeriodEnd());
        String stripeStatus = subscription.getStatus(); // active, past_due, canceled, etc.

        UserSubscription userSub = userSubRepository.findByStripeCustomerId(customerId).orElse(null);
        if (userSub == null) {
            return;
        }
        userSub.setCurrentPeriodEnd(periodEnd);

        if ("past_due".equals(stripeStatus) && userSub.getStatus() == SubscriptionStatus.active) {
            lifecycleService.startGracePeriod(userSub);
            log.info("[WEBHOOK] subscription.updated userId={} -> grace_period", userSub.getUser().getId());
        } else if ("active".equals(stripeStatus) && userSub.getStatus() != SubscriptionStatus.active) {
            userSub.setStatus(SubscriptionStatus.active);
            userSub.setGracePeriodEnd(null);
            userSubRepository.save(userSub);
            log.info("[WEBHOOK] subscription.updated userId={} -> active", userSub.getUser().getId());
        } else {
            userSubRepository.save(userSub);
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
