package com.prayer.pointfinder.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * A club invoice issued out of band by an admin and sent through Stripe. The
 * local row mirrors the Stripe invoice so members can list their billing
 * history without a Stripe round trip, and so the {@code invoice.paid} webhook
 * knows how many months of term the payment buys.
 */
@Entity
@Table(name = "org_invoices")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class OrgInvoice {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "org_id", nullable = false)
    private Organization organization;

    @Column(name = "stripe_invoice_id", nullable = false, unique = true)
    private String stripeInvoiceId;

    @Column(name = "amount_cents", nullable = false)
    private long amountCents;

    @Column(nullable = false)
    @Builder.Default
    private String currency = "eur";

    @Column
    private String description;

    /** Mirrors Stripe's invoice status: open, paid, void, uncollectible, draft. */
    @Column(nullable = false)
    private String status;

    @Column(name = "hosted_invoice_url")
    private String hostedInvoiceUrl;

    @Column(name = "invoice_pdf")
    private String invoicePdf;

    @Column(name = "due_at")
    private Instant dueAt;

    @Column(name = "paid_at")
    private Instant paidAt;

    /** Months of club term this invoice buys when it is paid. */
    @Column(name = "term_months", nullable = false)
    @Builder.Default
    private int termMonths = 12;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
