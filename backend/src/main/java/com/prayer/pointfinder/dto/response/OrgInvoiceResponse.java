package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.UUID;

/**
 * One club invoice as the dashboard shows it. {@code hostedInvoiceUrl} is the
 * Stripe-hosted payment page and {@code invoicePdf} the downloadable copy;
 * both may be null on a draft that never finalized.
 */
public record OrgInvoiceResponse(
    UUID id,
    UUID orgId,
    String stripeInvoiceId,
    long amountCents,
    String currency,
    String description,
    /** open, paid, void, uncollectible, draft — mirrors Stripe. */
    String status,
    String hostedInvoiceUrl,
    String invoicePdf,
    Instant dueAt,
    Instant paidAt,
    int termMonths,
    Instant createdAt
) {}
