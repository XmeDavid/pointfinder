package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.config.StripeConfig;
import com.prayer.pointfinder.service.StripeWebhookService;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.model.Event;
import com.stripe.model.Invoice;
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

    @PostMapping("/stripe")
    public ResponseEntity<String> handleStripeWebhook(
            @RequestBody String payload,
            @RequestHeader("Stripe-Signature") String sigHeader) {

        Event event;
        try {
            event = Webhook.constructEvent(payload, sigHeader, stripeConfig.getWebhookSecret());
        } catch (SignatureVerificationException e) {
            log.warn("[WEBHOOK] Invalid Stripe signature");
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Invalid signature");
        }

        String type = event.getType();
        log.info("[WEBHOOK] Received event type={} id={}", type, event.getId());

        switch (type) {
            case "checkout.session.completed" -> {
                Session session = (Session) event.getDataObjectDeserializer()
                    .getObject().orElse(null);
                if (session != null) webhookService.handleCheckoutCompleted(session);
            }
            case "invoice.paid" -> {
                Invoice invoice = (Invoice) event.getDataObjectDeserializer()
                    .getObject().orElse(null);
                if (invoice != null) webhookService.handleInvoicePaid(invoice);
            }
            case "invoice.payment_failed" -> {
                Invoice invoice = (Invoice) event.getDataObjectDeserializer()
                    .getObject().orElse(null);
                if (invoice != null) webhookService.handleInvoicePaymentFailed(invoice);
            }
            case "customer.subscription.deleted" -> {
                Subscription sub = (Subscription) event.getDataObjectDeserializer()
                    .getObject().orElse(null);
                if (sub != null) webhookService.handleSubscriptionDeleted(sub);
            }
            case "customer.subscription.updated" -> {
                Subscription sub = (Subscription) event.getDataObjectDeserializer()
                    .getObject().orElse(null);
                if (sub != null) webhookService.handleSubscriptionUpdated(sub);
            }
            default -> log.debug("[WEBHOOK] Unhandled event type: {}", type);
        }

        return ResponseEntity.ok("ok");
    }
}
