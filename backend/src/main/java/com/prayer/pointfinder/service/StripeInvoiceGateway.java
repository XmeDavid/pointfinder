package com.prayer.pointfinder.service;

import java.time.Instant;
import java.util.UUID;

/**
 * The whole Stripe SDK surface used by club invoicing, behind one interface.
 *
 * <p>Everything above this line — {@link OrgInvoiceService}, the admin
 * endpoints, the webhook handler — is plain domain code that can be tested
 * against a stub. The only implementation that talks to Stripe is
 * {@link StripeInvoiceGatewayImpl}, so no test ever needs a network call or a
 * live API key.
 */
public interface StripeInvoiceGateway {

    /** False when {@code STRIPE_SECRET_KEY} is unset, so callers can fail with a clear error. */
    boolean isConfigured();

    /**
     * Returns {@code existingCustomerId} when the org already has one,
     * otherwise creates a Stripe Customer carrying the club's billing email,
     * the org name, and {@code metadata.orgId}.
     */
    String ensureCustomer(String existingCustomerId, String email, String name, UUID orgId);

    /**
     * Creates a send-invoice Stripe Invoice with a single line item, finalizes
     * it, and sends it to the customer's email.
     */
    IssuedInvoice issueInvoice(IssueInvoiceCommand command);

    /** What an admin asked for. Amounts are minor units, as Stripe counts them. */
    record IssueInvoiceCommand(
        String customerId,
        UUID orgId,
        long amountCents,
        String currency,
        String description,
        int dueDays,
        int termMonths
    ) {}

    /** What Stripe returned, reduced to the fields {@code org_invoices} stores. */
    record IssuedInvoice(
        String id,
        String status,
        String hostedInvoiceUrl,
        String invoicePdf,
        Instant dueAt
    ) {}
}
