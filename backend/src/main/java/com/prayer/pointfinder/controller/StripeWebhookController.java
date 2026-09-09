package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.config.StripeConfig;
import com.prayer.pointfinder.service.StripeWebhookService;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.model.Event;
import com.stripe.model.EventDataObjectDeserializer;
import com.stripe.model.Invoice;
import com.stripe.model.StripeObject;
import com.stripe.model.Subscription;
import com.stripe.model.checkout.Session;
import com.stripe.net.Webhook;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/webhooks")
@RequiredArgsConstructor
@Slf4j
public class StripeWebhookController {

    private final StripeConfig stripeConfig;
    private final StripeWebhookService webhookService;

    /**
     * Deserialize event data, falling back to unsafe deserialization if the
     * Stripe SDK API version doesn't match the event's version.
     */
    private <T extends StripeObject> T deserialize(Event event, Class<T> clazz) {
        EventDataObjectDeserializer deserializer = event.getDataObjectDeserializer();
        StripeObject obj = deserializer.getObject().orElse(null);
        if (obj == null) {
            try {
                obj = deserializer.deserializeUnsafe();
                log.info("[WEBHOOK] Used unsafe deserialization for event={}", event.getId());
            } catch (Exception e) {
                log.error("[WEBHOOK] Failed to deserialize event={}: {}", event.getId(), e.getMessage());
                return null;
            }
        }
        return clazz.isInstance(obj) ? clazz.cast(obj) : null;
    }

    @PostMapping("/stripe")
    public ResponseEntity<String> handleStripeWebhook(
            @RequestBody String payload,
            @RequestHeader(value = "Stripe-Signature", required = false) String sigHeader) {
        // Stripe always signs; a call without the header is not Stripe and
        // deserves a 400, not the 500 a missing required header produces.
        if (sigHeader == null || sigHeader.isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Missing signature");
        }

        Event event;
        try {
            event = Webhook.constructEvent(payload, sigHeader, stripeConfig.getWebhookSecret());
        } catch (SignatureVerificationException e) {
            log.warn("[WEBHOOK] Invalid Stripe signature");
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Invalid signature");
        }

        String type = event.getType();
        log.info("[WEBHOOK] Received event type={} id={}", type, event.getId());

        // Every branch goes through applyOnce, which skips an event id already
        // in stripe_events and records it alongside the effect in one
        // transaction. Stripe redelivers freely; the ledger keeps each event's
        // effect to exactly one application.
        try {
            switch (type) {
                case "checkout.session.completed" -> {
                    Session session = deserialize(event, Session.class);
                    if (session != null) {
                        log.info("[WEBHOOK] checkout.session.completed clientRef={} customer={}", session.getClientReferenceId(), session.getCustomer());
                        webhookService.applyOnce(event.getId(), type,
                            () -> webhookService.handleCheckoutCompleted(session));
                    } else {
                        log.error("[WEBHOOK] checkout.session.completed could not deserialize event={}", event.getId());
                    }
                }
                case "invoice.paid" -> {
                    Invoice invoice = deserialize(event, Invoice.class);
                    if (invoice != null) {
                        webhookService.applyOnce(event.getId(), type,
                            () -> webhookService.handleInvoicePaid(invoice));
                    }
                }
                case "invoice.voided", "invoice.marked_uncollectible" -> {
                    Invoice invoice = deserialize(event, Invoice.class);
                    if (invoice != null) {
                        String status = "invoice.voided".equals(type) ? "void" : "uncollectible";
                        webhookService.applyOnce(event.getId(), type,
                            () -> webhookService.handleInvoiceClosed(invoice, status));
                    }
                }
                case "invoice.payment_failed" -> {
                    Invoice invoice = deserialize(event, Invoice.class);
                    if (invoice != null) {
                        webhookService.applyOnce(event.getId(), type,
                            () -> webhookService.handleInvoicePaymentFailed(invoice));
                    }
                }
                case "customer.subscription.deleted" -> {
                    Subscription sub = deserialize(event, Subscription.class);
                    if (sub != null) {
                        webhookService.applyOnce(event.getId(), type,
                            () -> webhookService.handleSubscriptionDeleted(sub));
                    }
                }
                case "customer.subscription.updated" -> {
                    Subscription sub = deserialize(event, Subscription.class);
                    if (sub != null) {
                        webhookService.applyOnce(event.getId(), type,
                            () -> webhookService.handleSubscriptionUpdated(sub));
                    }
                }
                default -> log.debug("[WEBHOOK] Unhandled event type: {}", type);
            }
        } catch (Exception e) {
            log.error("[WEBHOOK] Error processing event type={} id={}: {}", type, event.getId(), e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Error processing webhook");
        }

        return ResponseEntity.ok("ok");
    }
}
